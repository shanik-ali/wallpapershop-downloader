# Wallpapershop Downloader

![GitHub all releases](https://img.shields.io/github/downloads/shanik-ali/wallpapershop-downloader/total.svg)

[➡️ Download the latest release](https://github.com/shanik-ali/wallpapershop-downloader/releases/latest)

## 📥 Description

Wallpapershop Downloader is a lightweight, standalone way to download Steam
Workshop items -- for example Wallpaper Engine wallpapers -- without
installing the full Steam client. It talks to Steam's servers directly and
saves straight to a folder you choose, so you save the disk space and
background overhead of running Steam itself just to grab Workshop files.

It supports **Wallpaper Engine** and other Workshop-enabled games.

**⚠️ You must own the game on the Steam account you log in with.**
Workshop items for a given game are gated by Steam behind ownership of that
game, the same as if you opened the Steam client itself. This app does not
bypass that check, get around it, or grant access to content for a game you
don't own -- it only removes the need to have the full Steam client
installed for an account that already owns it.

This app is built with **Tauri** + **React** and uses:

- **DepotDownloaderMod**

## ✅ Requirements

- You must own the base game (e.g. Wallpaper Engine) on the Steam account
  you use to download.

Before using the app, make sure you have installed:

- [.NET 9.0 Runtime](https://dotnet.microsoft.com/download/dotnet/thank-you/runtime-9.0.0-windows-x64-installer)

## 🚀 Usage

1. Download and install the latest release:

   [➡️ Download the latest release](https://github.com/shanik-ali/wallpapershop-downloader/releases/latest)

2. Make sure the Steam account you'll log in with **owns the base game**
   (e.g. Wallpaper Engine) -- the same requirement as using the Steam
   Workshop from inside Steam itself.

3. Go to any Steam Workshop page, such as:

   - Wallpaper Engine
   - Left 4 Dead 2
   - Cities: Skylines
   - Or other supported games

4. Find the mod, map, or workshop item you want to download and copy its URL.

   Example:

   ```txt
   https://steamcommunity.com/sharedfiles/filedetails/?id=3445534475
   ```

5. Open the app and paste the URL into the input box.

   The app will automatically detect the game. If it does not, you can search
   for the game manually.

6. Choose your desired download folder.

7. Click `Download` and wait for the download to finish.

## 🐞 Bug Reports

If you encounter any issues or bugs, feel free to open an issue here:

[🐞 Report a Bug](https://github.com/shanik-ali/wallpapershop-downloader/issues)

Giving the repository a star would also be greatly appreciated.

## 🙏 Credits

- **Original project:** this app is based on
  [steam-workshop-download](https://github.com/Hikkywannafly/steam-workshop-download)
  by **Hikkywannafly**. All credit for the original application and its design
  goes to the original author.
- **Changes in this version:** new name and branding, a custom logo and colour
  scheme, light/dark/system themes, and local account management, by
  [shanik-ali](https://github.com/shanik-ali).
- **DepotDownloaderMod:** the bundled downloader is licensed under the
  GNU GPL v2. Its license text is included in `src-tauri/assets/LICENSE`.
- Built with [Tauri](https://tauri.app) and [React](https://react.dev).

If you are the owner of the original project and want any credit changed or
this repository removed, please open an issue and I will respond promptly.
