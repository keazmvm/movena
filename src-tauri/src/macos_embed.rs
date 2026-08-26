//! In-window video embedding for macOS.
//!
//! On Windows and X11 mpv honours `--wid` and parents its output into the
//! window we hand it. macOS has no such path: `video/out/mac/common.swift`
//! unconditionally calls `initWindow()`, so libmpv always spawns its own
//! NSWindow and the `--wid` value is ignored. That is the stray window that
//! shows up next to the app.
//!
//! Since libmpv runs in-process we can fix this from the AppKit side instead:
//! mpv is told to title its window with `SURFACE_TITLE`, we wait for that
//! window to appear, strip its chrome, and add it as a child window ordered
//! *below* the main window. The webview is transparent while `is-playing` is
//! set, so the video shows through it and the React controls keep compositing
//! on top — same visual result as `--wid` embedding elsewhere.

use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{mpsc, Mutex};
use std::thread;
use std::time::Duration;

use objc2::rc::Retained;
use objc2::runtime::{AnyClass, NSObjectProtocol};
use objc2::{AnyThread, MainThreadMarker};
use objc2_app_kit::{
    NSApplication, NSApplicationPresentationOptions, NSColor, NSCursor, NSEvent, NSImage, NSView,
    NSWindow, NSWindowCollectionBehavior, NSWindowOrderingMode, NSWindowStyleMask,
};
use objc2_foundation::{NSAlignmentOptions, NSData, NSPoint, NSRect, NSSize};
use objc2_quartz_core::CACornerMask;
use tauri::{AppHandle, Emitter, Manager};

/// Window title handed to mpv via `--title`, used to recognise its NSWindow.
pub const SURFACE_TITLE: &str = "Movena Video Surface";

/// How long to wait for mpv to create its window before giving up. mpv only
/// builds it once the first video frame is configured, so this covers the
/// initial network/demuxer latency of a stream.
const ATTACH_POLL_INTERVAL: Duration = Duration::from_millis(5);
const ATTACH_ATTEMPTS: u32 = 2000;

/// Comfortably longer than the macOS fullscreen animation.
const SETTLE_DELAY: Duration = Duration::from_millis(700);

/// How often to check that mpv has not taken keyboard focus. Rare enough to
/// cost nothing, often enough that a lapse is not noticeable.
const KEY_WATCH_INTERVAL: Duration = Duration::from_millis(500);

/// Whether we currently own an mpv window. Guards the per-resize window scan.
static ATTACHED: AtomicBool = AtomicBool::new(false);

/// Whether a settle re-check is already scheduled.
static RESYNC_PENDING: AtomicBool = AtomicBool::new(false);

/// Last observed fullscreen state of the main window, so `sync` can tell an
/// ordinary resize apart from a fullscreen transition.
static WAS_FULLSCREEN: AtomicBool = AtomicBool::new(false);

/// Bumped on every start/stop so a poller left over from a previous stream
/// cannot adopt a window belonging to the next one.
static GENERATION: AtomicU64 = AtomicU64::new(0);

/// How often the pointer is sampled while it is hidden. Frequent enough to
/// feel immediate, and it runs only while the chrome is out of the way.
const POINTER_POLL_INTERVAL: Duration = Duration::from_millis(80);

/// Invalidates a running pointer watch when the pointer is revealed again.
static CURSOR_GENERATION: AtomicU64 = AtomicU64::new(0);

/// Whether the main window is currently in our own screen-filling mode.
static SIMPLE_FULLSCREEN: AtomicBool = AtomicBool::new(false);

/// Frame to restore when leaving it, as [x, y, width, height].
static WINDOWED_FRAME: Mutex<Option<[f64; 4]>> = Mutex::new(None);

/// Style mask to restore when leaving it.
static WINDOWED_STYLE_MASK: Mutex<Option<usize>> = Mutex::new(None);

/// Our dock icon, compiled in rather than read from the bundle: `cargo run`
/// during development produces a bare executable with no bundle to read from,
/// and that is exactly the case where mpv's icon takeover is visible.
const APP_ICON_ICNS: &[u8] = include_bytes!("../icons/icon.icns");

// ── Main-thread plumbing ─────────────────────────────────────

/// Run `f` on the main thread. Executes inline when already there (window
/// event handlers), otherwise hops via the event loop.
fn with_main<F>(app: &AppHandle, f: F)
where
    F: FnOnce(&AppHandle, MainThreadMarker) + Send + 'static,
{
    if let Some(mtm) = MainThreadMarker::new() {
        f(app, mtm);
        return;
    }
    let app = app.clone();
    let _ = app.clone().run_on_main_thread(move || {
        if let Some(mtm) = MainThreadMarker::new() {
            f(&app, mtm);
        }
    });
}

/// Run `f` on the main thread and wait for its result, bounded by `timeout`.
/// Returns `None` if we are already on the main thread (caller must not block
/// there) or the hop did not complete in time.
fn with_main_blocking<F>(app: &AppHandle, timeout: Duration, f: F) -> Option<bool>
where
    F: FnOnce(&AppHandle, MainThreadMarker) -> bool + Send + 'static,
{
    if let Some(mtm) = MainThreadMarker::new() {
        return Some(f(app, mtm));
    }
    let (tx, rx) = mpsc::channel();
    let app = app.clone();
    app.clone()
        .run_on_main_thread(move || {
            let done = MainThreadMarker::new()
                .map(|mtm| f(&app, mtm))
                .unwrap_or(false);
            let _ = tx.send(done);
        })
        .ok()?;
    rx.recv_timeout(timeout).ok()
}

// ── AppKit helpers ───────────────────────────────────────────

fn parent_window(app: &AppHandle) -> Option<Retained<NSWindow>> {
    let ptr = app.get_webview_window("main")?.ns_window().ok()? as *mut NSWindow;
    unsafe { Retained::retain(ptr) }
}

/// Look up mpv's window by the title we gave it. Re-scanned on every use
/// rather than cached, so a window mpv tears down and rebuilds can never
/// leave us holding a dangling pointer.
///
/// Only *visible* windows count. `mpv_terminate_destroy` closes mpv's window,
/// but a closed NSWindow lingers in `NSApp.windows` until the autorelease pool
/// drains — so when one instance is replaced by another (React StrictMode
/// double-invokes the start effect in development, and every stream switch does
/// the same thing), a title-only match can return the corpse of the previous
/// instance. Adopting that one parks an invisible window inside the UI and
/// leaves the real video floating in its own window.
fn find_surface(mtm: MainThreadMarker) -> Option<Retained<NSWindow>> {
    let windows = NSApplication::sharedApplication(mtm).windows();
    for i in 0..windows.count() {
        let window = windows.objectAtIndex(i);
        if window.title().to_string() == SURFACE_TITLE && window.isVisible() {
            return Some(window);
        }
    }
    None
}

/// The main window's content area in screen coordinates — the region the
/// webview covers, and therefore where the video belongs.
///
/// Deliberately `contentLayoutRect`, not `contentView().bounds()`. This
/// window carries `NSFullSizeContentViewWindowMask` (Tauri's default on
/// macOS — see `TitleBarStyle::Visible` in tauri-runtime-wry), which is what
/// lets the webview draw its own UI behind the traffic lights: the content
/// view's *bounds* cover the entire window, title bar included.
/// `contentLayoutRect` is AppKit's own answer to "the portion of that not
/// obscured under the title bar" (Apple's docs, verbatim) — sizing the video
/// to the full content view instead put mpv's square top corners directly
/// behind the title bar, and its own corners are rounded, so they exposed a
/// sliver of that square video right where the curve pulls away. Stopping
/// short of the title bar avoids that sliver outright, with nothing here
/// guessing at *how much* to round off.
///
/// The rect is snapped outward to whole backing-store pixels. Converting view
/// bounds to screen coordinates readily yields fractional values (window at a
/// half-point position, odd content height on a Retina display), and a window
/// frame that lands between device pixels gets composited with a blended edge —
/// visible as a faint hairline along the top and bottom of the video.
fn video_frame(parent: &NSWindow) -> NSRect {
    let rect = if SIMPLE_FULLSCREEN.load(Ordering::SeqCst) {
        // Screen-filling mode has no title bar, so the video is the whole
        // window — and the content view cannot be asked. Its geometry is still
        // laid out for the title bar that the style mask change just removed:
        // measured 1470x956+0+-32, the video pushed down by exactly the menu
        // bar height, leaving a strip of desktop showing through the top of the
        // transparent webview.
        parent.frame()
    } else {
        // Already in the window's own coordinate space (per Apple's docs),
        // unlike a view's `bounds` — no `convertRect_toView` round trip needed.
        parent.convertRectToScreen(parent.contentLayoutRect())
    };
    parent.backingAlignedRect_options(rect, NSAlignmentOptions::AlignAllEdgesOutward)
}

/// macOS rounds an ordinary window's corners at the system compositor level,
/// which the mpv surface — a separate, borderless child window — never gets.
/// `video_frame` already keeps it out from under the title bar entirely (see
/// its own doc comment), which is what the *top* corners needed — there's a
/// real API for "the part not obscured by the title bar" to line up with.
/// The bottom two have no such chrome to hide behind and no public API
/// reports the system's actual radius, so this only matches the commonly
/// measured default for standard-style windows rather than something
/// verified exact. `PlayerShell`'s corner-sliver overlay (rendered in the
/// webview, above this surface) is the belt to this braces: a wrong radius
/// here only leaves this layer's flat black square corner peeking a little
/// past that overlay's own rounded cutout, or short of it — either way a
/// small, forgiving mismatch rather than a hard edge. Screen-filling mode has
/// no border to round to, so corners go back to square there.
const SURFACE_CORNER_RADIUS: f64 = 10.0;

/// Clip the surface's bottom two corners to (a close match of) the system's
/// own window corner radius, so nothing paints past where the parent's
/// rounded frame already stops contributing pixels. The top two are left
/// square: `video_frame` no longer extends the surface under the title bar,
/// so its top corners now land on the flat seam between the title bar and
/// the content below — a straight line, nothing there to round off.
///
/// This masks the *content view's* layer rather than making the window
/// itself non-opaque: opacity is load-bearing elsewhere (see `adopt`'s note
/// on the hairline seam an alpha-blended window edge produces), and clipping
/// the layer leaves it intact — the corner simply paints the window's own
/// black background instead of video, rather than turning translucent.
fn round_surface_corners(surface: &NSWindow) {
    let Some(content_view) = surface.contentView() else {
        return;
    };
    content_view.setWantsLayer(true);
    let Some(layer) = content_view.layer() else {
        return;
    };
    let radius = if SIMPLE_FULLSCREEN.load(Ordering::SeqCst) {
        0.0
    } else {
        SURFACE_CORNER_RADIUS
    };
    layer.setCornerRadius(radius);
    layer.setMasksToBounds(true);
    // AppKit/Core Animation's layer space has its origin at the bottom-left,
    // so "MinY" is the *bottom* of the surface here.
    layer.setMaskedCorners(CACornerMask::LayerMinXMinYCorner | CACornerMask::LayerMaxXMinYCorner);
}

/// Move mpv's window to `frame`.
///
/// `setFrame:display:` alone is not enough. mpv's NSWindow subclass overrides
/// `constrainFrameRect:toScreen:` and clamps the frame to the screen's
/// *visibleFrame* — the area below the menu bar (mpv's window.swift:465). In
/// screen-filling mode that turns a requested 1470x956+0+0 into +0+-32, pushing
/// the video down by exactly the menu bar height and leaving a strip of desktop
/// showing through the top of the transparent webview. `setFrameOrigin:` is not
/// routed through that constraint, so it puts the origin back.
fn place_surface(surface: &NSWindow, frame: NSRect) {
    surface.setFrame_display(frame, true);
    surface.setFrameOrigin(frame.origin);
    round_surface_corners(surface);
}

/// Whether `surface` is currently parented to `parent`.
///
/// Worth re-checking rather than assuming: AppKit tears down child-window
/// relationships across a native fullscreen transition. Once detached, mpv's
/// window is an ordinary top-level window again and floats *above* the main
/// window instead of below it — covering the whole control overlay.
fn is_child_of(parent: &NSWindow, surface: &NSWindow) -> bool {
    surface
        .parentWindow()
        .is_some_and(|current| current.windowNumber() == parent.windowNumber())
}

fn adopt(parent: &NSWindow, surface: &NSWindow) {
    surface.setStyleMask(NSWindowStyleMask::Borderless);
    surface.setHasShadow(false);
    surface.setMovable(false);
    // Belt and braces only — mpv reassigns this property from its own
    // `input-cursor-passthrough` option, which is where we actually set it.
    surface.setIgnoresMouseEvents(true);
    // Opaque black behind the video: an alpha-blended window edge is exactly
    // what produces the hairline seams against the transparent webview.
    surface.setOpaque(true);
    surface.setBackgroundColor(Some(&NSColor::blackColor()));
    // Only keep it out of Cmd-` cycling. Explicitly *not* FullScreenAuxiliary:
    // that marks a window as able to share a fullscreen window's space, and
    // such windows are drawn above the fullscreen window — which put the video
    // over the control overlay and hid it completely. A child window follows
    // its parent into fullscreen on its own, so the flag bought nothing.
    surface.setCollectionBehavior(NSWindowCollectionBehavior::IgnoresCycle);
    let frame = video_frame(parent);
    place_surface(surface, frame);

    // Stop the main window casting a shadow for as long as it is transparent.
    // macOS derives a window's shadow from its *opaque* pixels, and during
    // playback the only opaque things in this window are the control popovers
    // and the play/pause badge — so the system drew a window shadow tracing
    // each of them, the halo that looked like a stray bubble around the UI.
    parent.setHasShadow(false);
    parent.invalidateShadow();
    unsafe { parent.addChildWindow_ordered(surface, NSWindowOrderingMode::Below) };
    log::info!(
        "mpv surface adopted into main window at {}x{} +{}+{} (ignoresMouseEvents {})",
        frame.size.width,
        frame.size.height,
        frame.origin.x,
        frame.origin.y,
        surface.ignoresMouseEvents(),
    );
}

/// Stamp our icon onto the dock.
///
/// mpv replaces the process icon with its own logo from `setAppIcon` in
/// `video/out/mac/common.swift`, which hangs off `initApp` and therefore runs
/// on every video-output reconfiguration, not just once per stream. Setting our
/// icon explicitly rather than restoring a previously captured one is also what
/// gets development builds right: those run unbundled, so there is no bundle
/// icon to fall back to.
fn apply_app_icon(mtm: MainThreadMarker) {
    let data = NSData::with_bytes(APP_ICON_ICNS);
    let Some(icon) = NSImage::initWithData(NSImage::alloc(), &data) else {
        log::warn!("could not decode the embedded app icon");
        return;
    };
    unsafe { NSApplication::sharedApplication(mtm).setApplicationIconImage(Some(&icon)) };
}

/// Put the main window into (or out of) fullscreen *without* using a macOS
/// fullscreen space — the window simply grows to cover the screen while the
/// menu bar and dock auto-hide.
///
/// Native fullscreen moves the window into a space of its own, and inside that
/// space the video kept drawing over the control overlay no matter how the
/// child window was ordered. Windowed playback composites correctly, so this
/// keeps the window in exactly that configuration and only changes its size.
///
/// Returns the state actually applied.
pub fn set_simple_fullscreen(app: &AppHandle, on: bool) -> bool {
    // A redundant call in the same direction is not a no-op below: the `on`
    // branch unconditionally overwrites `WINDOWED_FRAME`/`WINDOWED_STYLE_MASK`
    // with whatever the window's geometry happens to be *right now* — which,
    // called a second time while already fullscreen, is the fullscreen
    // geometry itself. The saved "frame to restore" is then gone, and leaving
    // fullscreen lands the window at screen size instead of where it started.
    // The frontend's own call site now serializes these (see fullscreen.ts),
    // but the guard belongs here too: it is what actually makes a second
    // same-direction request harmless rather than merely making it rarer.
    if SIMPLE_FULLSCREEN.load(Ordering::SeqCst) == on {
        return on;
    }
    let _ = with_main_blocking(app, Duration::from_secs(2), move |app, mtm| {
        let Some(parent) = parent_window(app) else {
            return false;
        };
        let nsapp = NSApplication::sharedApplication(mtm);
        // Record the mode before touching any geometry: `video_frame` reads it
        // to decide where the video belongs, and it is consulted below.
        SIMPLE_FULLSCREEN.store(on, Ordering::SeqCst);

        if on {
            let Some(screen) = parent.screen() else {
                return false;
            };
            let frame = parent.frame();
            *WINDOWED_FRAME.lock().unwrap_or_else(|e| e.into_inner()) = Some([
                frame.origin.x,
                frame.origin.y,
                frame.size.width,
                frame.size.height,
            ]);
            // Hide, not auto-hide. This is what `NSScreen.visibleFrame` is
            // computed from, and mpv's window clamps itself to that rect
            // (window.swift:465). With the menu bar merely auto-hiding, the
            // visible frame still excludes it, so mpv pulled the video 32pt
            // down and left a strip of desktop at the top of the screen. Fully
            // hidden, the visible frame is the whole screen and the clamp
            // becomes a no-op — the constraint is satisfied instead of fought.
            nsapp.setPresentationOptions(
                NSApplicationPresentationOptions::HideDock
                    | NSApplicationPresentationOptions::HideMenuBar,
            );

            // Drop just the title bar, keeping every other bit of the mask.
            // AppKit's frame constraint holds a *titled* window clear of the
            // menu bar area — measured: asked for 1470x956, got 1470x924 — so
            // it has to go for the window to cover the screen.
            *WINDOWED_STYLE_MASK
                .lock()
                .unwrap_or_else(|e| e.into_inner()) = Some(parent.styleMask().0 as usize);
            toggle_style_mask(&parent, NSWindowStyleMask::Titled, false);

            let target = screen.frame();
            parent.setFrame_display(target, true);
            // A borderless window is not key by default, and losing key status
            // would take the keyboard shortcuts with it.
            parent.makeKeyAndOrderFront(None);
            restore_mouse_tracking(&parent);
            // Last, deliberately: makeKeyAndOrderFront installs a first
            // responder of its own choosing, so focusing the webview any
            // earlier gets silently undone.
            focus_webview(&parent);
            let got = parent.frame();
            log::info!(
                "simple fullscreen on — asked for {}x{}, got {}x{}{}",
                target.size.width,
                target.size.height,
                got.size.width,
                got.size.height,
                if got.size.height < target.size.height {
                    " (AppKit constrained it)"
                } else {
                    ""
                }
            );
        } else {
            nsapp.setPresentationOptions(NSApplicationPresentationOptions::Default);
            if let Some(mask) = WINDOWED_STYLE_MASK
                .lock()
                .unwrap_or_else(|e| e.into_inner())
                .take()
            {
                parent.setStyleMask(NSWindowStyleMask(mask as _));
            }
            if let Some([x, y, w, h]) = WINDOWED_FRAME
                .lock()
                .unwrap_or_else(|e| e.into_inner())
                .take()
            {
                parent.setFrame_display(NSRect::new(NSPoint::new(x, y), NSSize::new(w, h)), true);
            }
            parent.makeKeyAndOrderFront(None);
            restore_mouse_tracking(&parent);
            focus_webview(&parent);
            log::info!("simple fullscreen off");
        }

        // Follow with the video, which is not driven by a resize event here.
        if let Some(surface) = find_surface(mtm) {
            place_surface(&surface, video_frame(&parent));
        }
        true
    });

    SIMPLE_FULLSCREEN.load(Ordering::SeqCst)
}

/// Give keyboard focus to the webview itself.
///
/// A style mask change resets the first responder, and tao's own helper points
/// it back at the *content view*. That is enough for tao's own key handling, but
/// not for ours: the WKWebView is a subview, and unless it holds first responder
/// status the DOM sees no key events at all — the player's shortcuts went dead
/// in screen-filling mode until a click on the picture happened to make the
/// webview first responder again.
fn focus_webview(parent: &NSWindow) {
    let Some(content) = parent.contentView() else {
        return;
    };
    match find_webview(&content) {
        Some(webview) => parent.makeFirstResponder(Some(&webview)),
        None => {
            // Worth hearing about: without the webview holding focus the
            // player's keyboard shortcuts stop reaching the DOM entirely.
            log::warn!("webview not found in the view tree; keyboard shortcuts may not respond");
            parent.makeFirstResponder(Some(&content))
        }
    };
}

/// Depth-first search for the WKWebView.
///
/// Asks the runtime whether a view *is a kind of* `WKWebView` rather than
/// matching its class name. wry subclasses it as `WryWebView` and wraps it in a
/// `WryWebViewParent`, so a name comparison found neither — measured: "webview
/// NOT FOUND, first responder is now WryWebViewParent", the container rather
/// than the view that feeds the DOM.
fn find_webview(view: &NSView) -> Option<Retained<NSView>> {
    let Some(webkit) = AnyClass::get(c"WKWebView") else {
        return None;
    };
    if view.isKindOfClass(webkit) {
        return unsafe { Retained::retain(view as *const NSView as *mut NSView) };
    }
    let subviews = view.subviews();
    for i in 0..subviews.count() {
        if let Some(found) = find_webview(&subviews.objectAtIndex(i)) {
            return Some(found);
        }
    }
    None
}

/// Rebuild mouse tracking after a style mask change.
///
/// Swapping the style mask makes AppKit replace the window's frame view, which
/// drops the tracking areas hanging off it. The webview then stops seeing
/// mouse-move events — and since the player hides the pointer whenever its
/// controls are hidden, and only a mouse-move brings both back, the cursor
/// stays invisible across the whole screen with no way to recover it.
fn restore_mouse_tracking(parent: &NSWindow) {
    parent.setAcceptsMouseMovedEvents(true);
    if let Some(view) = parent.contentView() {
        refresh_tracking_areas(&view);
    }
}

/// Add or remove style mask bits, then put the content view back in charge of
/// events.
///
/// Changing the style mask makes AppKit rebuild the window's frame view and
/// drops the first responder on the floor. tao's own helper carries the note
/// "If we don't do this, key handling will break. Therefore, never call
/// `setStyleMask` directly!" — mouse-move delivery goes the same way, which is
/// how the pointer ended up hidden with no way to bring it back.
fn toggle_style_mask(parent: &NSWindow, mask: NSWindowStyleMask, on: bool) {
    let current = parent.styleMask();
    parent.setStyleMask(if on { current | mask } else { current & !mask });
    focus_webview(parent);
}

/// `updateTrackingAreas` does not recurse, and the tracking area that matters
/// belongs to the webview deep in the hierarchy, not to the content view.
fn refresh_tracking_areas(view: &NSView) {
    view.updateTrackingAreas();
    let subviews = view.subviews();
    for i in 0..subviews.count() {
        refresh_tracking_areas(&subviews.objectAtIndex(i));
    }
}

/// Watch which window holds key focus for as long as a video is embedded.
///
/// Only the key window is sent mouse-moved and key events, so if mpv's window
/// takes focus the controls stop reacting to the mouse and the keyboard
/// shortcuts go dead — while clicks still work, because a click makes the
/// window it lands on key again. Hand focus straight back, and log the
/// transition so the cause is visible rather than inferred.
fn watch_key_window(app: &AppHandle, gen: u64) {
    let app = app.clone();
    thread::spawn(move || {
        let mut last = isize::MIN;
        while ATTACHED.load(Ordering::SeqCst) && GENERATION.load(Ordering::SeqCst) == gen {
            let (tx, rx) = mpsc::channel();
            with_main(&app, move |app, mtm| {
                let key = NSApplication::sharedApplication(mtm).keyWindow();
                let key_number = key.as_ref().map_or(0, |w| w.windowNumber());
                let parent = parent_window(app);
                let surface = find_surface(mtm);

                let is_surface = surface
                    .as_ref()
                    .is_some_and(|s| s.windowNumber() == key_number);
                let label = if is_surface {
                    "mpv surface"
                } else if parent
                    .as_ref()
                    .is_some_and(|p| p.windowNumber() == key_number)
                {
                    "main window"
                } else if key_number == 0 {
                    "none"
                } else {
                    "another window"
                };

                let mut accepts_moves = None;
                if let Some(parent) = parent.as_ref() {
                    if is_surface {
                        parent.makeKeyWindow();
                        // `makeKeyWindow` alone does not touch first responder —
                        // it only matters here because whatever *did* leave the
                        // webview as first responder is the same event that let
                        // mpv's window steal key status in the first place, so
                        // by the time this branch runs it usually needs restating
                        // too. Without it, key status comes back but keyboard
                        // shortcuts (starting with `F` to leave fullscreen) stay
                        // dead until a click on the video happens to refocus it.
                        focus_webview(&parent);
                        log::info!("mpv surface took key focus; handed it back");
                    }
                    // Mouse-moved events reach a window only if it opts in.
                    // Re-assert rather than set once: something in the
                    // fullscreen path is clearing it, and while it is off the
                    // pointer stays hidden with no way to recover it.
                    accepts_moves = Some(parent.acceptsMouseMovedEvents());
                    if accepts_moves == Some(false) {
                        parent.setAcceptsMouseMovedEvents(true);
                        if let Some(view) = parent.contentView() {
                            refresh_tracking_areas(&view);
                        }
                    }
                }
                let _ = tx.send((key_number, label.to_string(), accepts_moves));
            });

            if let Ok((key_number, label, accepts_moves)) = rx.recv_timeout(Duration::from_secs(2))
            {
                if key_number != last {
                    last = key_number;
                    log::info!(
                        "key window is now the {label} (#{key_number}), \
                         acceptsMouseMovedEvents {accepts_moves:?}"
                    );
                }
                if accepts_moves == Some(false) {
                    log::info!("main window had stopped accepting mouse-moved events; re-enabled");
                }
            }
            thread::sleep(KEY_WATCH_INTERVAL);
        }
    });
}

/// Hide the pointer until the mouse next moves, and report that movement.
///
/// While the pointer is genuinely hidden — by `cursor: none` or by AppKit, it
/// makes no difference — the webview receives no further mouse-move events. The
/// act of hiding therefore silences the very signal the interface needs to know
/// when to come back, which is why clicking was the only way to restore the
/// controls. macOS does reveal the pointer again by itself on the next
/// movement; only the notification was missing.
///
/// So while hidden, the pointer's screen position is polled and a
/// `pointer-moved` event is emitted as soon as it shifts. The poll exists only
/// during that window and stops on the first movement.
pub fn set_cursor_hidden(app: &AppHandle, hidden: bool) {
    let generation = CURSOR_GENERATION.fetch_add(1, Ordering::SeqCst) + 1;

    with_main(app, move |_app, _mtm| {
        NSCursor::setHiddenUntilMouseMoves(hidden);
    });

    if !hidden {
        return;
    }

    let app = app.clone();
    thread::spawn(move || {
        let origin = pointer_location(&app);
        loop {
            thread::sleep(POINTER_POLL_INTERVAL);
            if CURSOR_GENERATION.load(Ordering::SeqCst) != generation {
                return; // The pointer was revealed by some other route.
            }
            let now = pointer_location(&app);
            let moved = (now.0 - origin.0).abs() > 1.0 || (now.1 - origin.1).abs() > 1.0;
            if moved {
                let _ = app.emit("pointer-moved", ());
                return;
            }
        }
    });
}

/// The pointer's position in screen coordinates, read on the main thread.
fn pointer_location(app: &AppHandle) -> (f64, f64) {
    let (tx, rx) = mpsc::channel();
    with_main(app, move |_app, _mtm| {
        let point = NSEvent::mouseLocation();
        let _ = tx.send((point.x, point.y));
    });
    rx.recv_timeout(Duration::from_secs(1))
        .unwrap_or((0.0, 0.0))
}

/// One-time setup of the main window. Run at startup, before any stream.
pub fn prepare_main_window(app: &AppHandle) {
    with_main(app, |app, mtm| {
        apply_app_icon(mtm);

        // Refuse native fullscreen. It puts the window in a space of its own
        // and inserts backdrop windows between it and its children: measured
        // z-order in that state was parent at 4, video at 2 — the video ends up
        // in front and hides the entire control overlay, and no child ordering
        // fixes it. `set_simple_fullscreen` fills the screen without a space,
        // and the green button falls back to zoom, which composites correctly.
        if let Some(parent) = parent_window(app) {
            parent.setCollectionBehavior(NSWindowCollectionBehavior::FullScreenNone);
        }
    });
}

// ── Public API ───────────────────────────────────────────────

/// Start watching for mpv's window and embed it as soon as it exists.
/// Returns immediately; the polling runs on a background thread.
pub fn attach(app: &AppHandle) {
    let app = app.clone();
    let generation = GENERATION.fetch_add(1, Ordering::SeqCst) + 1;
    log::info!("watching for the mpv surface (generation {generation})");
    std::thread::spawn(move || {
        for _ in 0..ATTACH_ATTEMPTS {
            if GENERATION.load(Ordering::SeqCst) != generation {
                log::info!("attach {generation} superseded, giving up the watch");
                return;
            }
            let attached = with_main_blocking(&app, Duration::from_secs(2), |app, mtm| {
                let Some(surface) = find_surface(mtm) else {
                    return false;
                };
                let Some(parent) = parent_window(app) else {
                    log::warn!("mpv surface found but the main window is not reachable");
                    return false;
                };
                adopt(&parent, &surface);
                // mpv has stamped its own logo onto the dock by now.
                apply_app_icon(mtm);
                // `mpv_start` runs on every stream switch, not just the first
                // one — including one that lands mid-fullscreen when a series
                // auto-advances to its next episode. `set_simple_fullscreen`
                // repairs tracking areas and first responder after the AppKit
                // operations known to disturb them (see its own comments), but
                // creating and adopting a brand new mpv window is itself such
                // an operation, and this path runs it unconditionally on every
                // switch with neither repair applied. Without this, the second
                // episode of a session started in fullscreen is the one where
                // the pointer and keyboard shortcuts stop reaching the webview.
                restore_mouse_tracking(&parent);
                focus_webview(&parent);
                true
            });
            if attached == Some(true) {
                ATTACHED.store(true, Ordering::SeqCst);
                watch_key_window(&app, generation);
                return;
            }
            std::thread::sleep(ATTACH_POLL_INTERVAL);
        }
        log::warn!(
            "mpv surface never appeared within {:?}; video stays in its own window",
            ATTACH_POLL_INTERVAL * ATTACH_ATTEMPTS
        );
    });
}

/// Keep the embedded video aligned with the main window, and keep it parented.
/// Call on resize, move, and fullscreen transitions.
pub fn sync(app: &AppHandle) {
    if !ATTACHED.load(Ordering::SeqCst) {
        return;
    }
    with_main(app, |app, mtm| {
        let (Some(surface), Some(parent)) = (find_surface(mtm), parent_window(app)) else {
            return;
        };

        let fullscreen = parent.styleMask().contains(NSWindowStyleMask::FullScreen);
        let toggled = WAS_FULLSCREEN.swap(fullscreen, Ordering::SeqCst) != fullscreen;

        // Restate the ordering across a fullscreen transition. Being a child is
        // not enough — the child can end up drawn *in front* of its parent while
        // the relationship itself survives, which hides the whole control
        // overlay. Detaching and re-adding is the only documented way to
        // restate it, so it is confined to actual transitions: doing it on
        // every event would flicker through a live window drag.
        if toggled || !is_child_of(&parent, &surface) {
            parent.removeChildWindow(&surface);
            unsafe { parent.addChildWindow_ordered(&surface, NSWindowOrderingMode::Below) };
            log::info!("restated child ordering (fullscreen now {fullscreen})");
        }

        place_surface(&surface, video_frame(&parent));
    });
}

/// Re-run `sync` once the window has settled.
///
/// The fullscreen transition is animated, and AppKit may drop the child window
/// relationship at the *end* of it — after the last resize event we see. One
/// delayed re-check catches that. At most one is ever pending, so the hundreds
/// of resize events from a live window drag cost nothing.
pub fn sync_after_settle(app: &AppHandle) {
    if !ATTACHED.load(Ordering::SeqCst) || RESYNC_PENDING.swap(true, Ordering::SeqCst) {
        return;
    }
    let app = app.clone();
    thread::spawn(move || {
        thread::sleep(SETTLE_DELAY);
        RESYNC_PENDING.store(false, Ordering::SeqCst);
        sync(&app);
    });
}

/// Release mpv's window from the view hierarchy. Must run to completion
/// before `mpv_terminate_destroy`, because `addChildWindow:` makes the parent
/// retain the child — without this the window would outlive mpv.
pub fn detach(app: &AppHandle) {
    GENERATION.fetch_add(1, Ordering::SeqCst);
    if !ATTACHED.swap(false, Ordering::SeqCst) {
        return;
    }
    with_main_blocking(app, Duration::from_millis(500), |app, mtm| {
        if let (Some(surface), Some(parent)) = (find_surface(mtm), parent_window(app)) {
            parent.removeChildWindow(&surface);
            surface.orderOut(None);
            // The window is opaque again once the player closes.
            parent.setHasShadow(true);
            parent.invalidateShadow();
        }
        apply_app_icon(mtm);
        true
    });
}
