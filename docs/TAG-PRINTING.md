# Print tags straight to the USB tag printer (no print window)

A website is not allowed to skip the browser's print window on its own. Microsoft Edge and Google Chrome can do it
if they are opened with one extra setting, called **kiosk printing**. Then every "Print tag" click goes straight to
the tag printer (Xprinter XP-420B).

Set this up once on the shop computer (Windows). The quick way takes one minute.

## Quick way: the setup file

1. On the shop computer, open the shop software, go to **Print tags**, and click **Download setup file (Windows)**.
   (It is also in the shop folder as `Setup-Direct-Tag-Printing.cmd`.)
2. Double-click the file.
   - If Windows says "Windows protected your PC", click **More info**, then **Run anyway**.
   - If Edge says the file "isn't commonly downloaded", click **…** next to it, then **Keep**.
3. A black window opens, shows two green **[OK]** lines, and says **All done**. Press any key to close it.

The file does two things:
- makes the tag printer the **default printer** (and stops Windows from changing it back by itself), and
- puts a **Print tags directly** icon on the desktop.

## Use it

1. Close all Edge (or Chrome) windows once, then open the shop software from the **Print tags directly** desktop icon.
   The first time, log in once in that window.
2. Click **Print tag** on a product, or **Print tags** on the Print tags page. The tag prints at once: no print window.

## Good to know

- Only windows opened from the **Print tags directly** icon skip the print window. Your normal browser still shows it.
- In that window **everything** prints to the tag printer. Print bills from your normal browser.
- If a tag prints in the wrong place, open **Print tags**, use **Move left / right** or **Move up / down**, and click
  **Test print one tag with outline**.
- If the print window still shows, close **all** windows of that icon and open it again from the icon.
- If the date or web address prints on the tag: open the **Print tags directly** window, press Ctrl+P once, open
  **More settings**, untick **Headers and footers**, and print. The browser remembers it.
- If the printer feeds a blank tag after each tag: in Windows **Printers & scanners**, open the Xprinter's
  **Printing preferences** and set the paper / label size to your tag size (for example 80 × 12 mm).

## Doing it by hand (if the setup file is not allowed)

1. **Default printer:** Windows key → type **Printers & scanners** → turn **off** "Let Windows manage my default
   printer" → click the Xprinter → **Set as default**.
2. **Shortcut:** right-click the desktop → **New → Shortcut** → paste this (one line) → **Next** → name it
   **Print tags directly** → **Finish**.

   Edge:
   ```
   "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" --kiosk-printing --user-data-dir="C:\AbharanamTags" https://1gram.abharanamcollections.com/shop-admin/tags
   ```
   Chrome:
   ```
   "C:\Program Files\Google\Chrome\Application\chrome.exe" --kiosk-printing --user-data-dir="C:\AbharanamTags" https://1gram.abharanamcollections.com/shop-admin/tags
   ```
