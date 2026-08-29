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
