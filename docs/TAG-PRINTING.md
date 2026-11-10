# Print tags straight to the USB tag printer (no print window)

A website is not allowed to skip the browser's print window on its own. Chrome can do it for you if you open it
with one extra setting, called **kiosk printing**. Then every "Print tag" click goes straight to the tag printer.

Set this up once on the shop computer (Windows).

## 1. Make the tag printer the default printer

1. Press the **Windows** key, type **Printers & scanners** and open it.
2. Turn **off** "Let Windows manage my default printer" (at the bottom of the page).
3. Click the tag printer in the list, then click **Set as default**.
4. Still on the tag printer, open **Printing preferences**. Set the paper / label size to your tag size
   (80 × 12 mm, or the size shown on the Print tags page) and click **OK**.

## 2. Make a "Print tags directly" Chrome shortcut

1. Right-click an empty part of the desktop, choose **New → Shortcut**.
2. In the box, paste this (one line):

   ```
   "C:\Program Files\Google\Chrome\Application\chrome.exe" --kiosk-printing --user-data-dir="C:\AbharanamTags" https://1gram.abharanamcollections.com/shop-admin
   ```

   If Chrome is somewhere else on your computer, right-click your usual Chrome icon → **Properties** and copy the path
   from **Target**.
3. Click **Next**, name it **Print tags directly**, click **Finish**.

## 3. Use it

1. Open the shop software with the **Print tags directly** shortcut. The first time, log in once in that window.
2. Click **Print tag** on a product (or **Print tags** on the Print tags page). The tag prints at once: no print window,
   no new tab.

## Good to know

- Only windows opened with this shortcut skip the print window. Your normal Chrome still shows it, so you can print
  bills on another printer from normal Chrome.
- In the shortcut window, **everything** prints to the default printer (the tag printer). Print bills from normal Chrome.
- If a tag prints in the wrong place, open **Print tags**, use **Move left / right** or **Move up / down**, and click
  **Test print one tag with outline**.
- If you see the print window anyway, close **all** windows of that shortcut and open it again from the shortcut.
- If the date, page title or web address prints on the tag: in normal Chrome press Ctrl+P once, open **More settings**,
  untick **Headers and footers**, and print. Chrome remembers it.
