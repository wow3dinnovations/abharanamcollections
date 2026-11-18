# Print tags straight to the USB tag printer (no print window)

A website is not allowed to print without the browser's print window. So the shop computer gets a small **print
helper**: it runs quietly in the background, and the shop software hands each tag to it. The helper prints it on the
tag printer (Xprinter XP-420B) at once. This works from your normal Chrome or Edge, with no special icon.

Set this up once on the computer that has the tag printer (Windows).

## Set up (one minute)

1. In Chrome or Edge, open the shop software, go to **Print tags**, and click **Download setup file (Windows)**.
   (It is also in the shop folder as `Setup-Direct-Tag-Printing.cmd`.)
2. Double-click the file.
   - If Windows says "Windows protected your PC", click **More info**, then **Run anyway**.
   - If the browser says the file "isn't commonly downloaded", click **…** next to it, then **Keep**.
3. A black window opens and shows green **[OK]** lines and **All done**. Press any key to close it.

## Use it

1. Open **Print tags** (or click **Print tag** on a product). Under the print buttons it now says
   "Tags print straight to XprinterXP-420B".
2. Click **Print**. The first time, the browser may ask to let the site **access other devices on your network /
   this computer**: click **Allow**. After that tags print at once, with no print window.

## Good to know

- The helper starts by itself when Windows starts. Nothing to open.
- Bills and other printing are not changed: they still show the normal print window.
- If a tag prints in the wrong place, open **Print tags**, use **Move left / right** or **Move up / down**, and click
  **Test print one tag with outline**.
- If the printer feeds a blank tag after each tag, or the tag is cut short: in Windows **Printers & scanners**, open the
  Xprinter's **Printing preferences** and set the label size to your tag size (for example 80 × 12 mm).
- If **Print tags** shows the yellow "Want tags to print without the print window?" box again, the helper is not
  running: restart the computer, or run the setup file again.
- If the browser asked about devices and you clicked **Block**: click the icon left of the web address, turn
  **Local network access** (or "devices") **on**, and reload the page.
- The helper keeps a short log at `%LOCALAPPDATA%\AbharanamPrint\helper.log`. Send it to us if printing fails.
- To remove it: delete **Abharanam tag printer** from the Startup folder (Windows key + R, type `shell:startup`)
  and the folder `%LOCALAPPDATA%\AbharanamPrint`.
