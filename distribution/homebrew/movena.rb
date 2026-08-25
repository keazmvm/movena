cask "movena" do
  version "0.1.8"
  # The current release publishes an Apple Silicon DMG only.
  sha256 "c91e4ec93cc6417d05ea1181faf0eded121528709bf1275cee99f33e22b1d754"

  url "https://github.com/movena-app/movena/releases/download/v#{version}/Movena_#{version}_aarch64.dmg"
  name "Movena"
  desc "Open-source IPTV and VOD player for Xtream Codes and M3U playlists"
  homepage "https://movena.frtx.cc/"

  depends_on arch: :arm64

  app "Movena.app"

  zap trash: [
    "~/Library/Application Support/com.movena.desktop",
    "~/Library/Caches/com.movena.desktop",
    "~/Library/Preferences/com.movena.desktop.plist",
  ]
end
