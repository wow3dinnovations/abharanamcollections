# Troubleshooting

> Rule of thumb: **make a backup first** (Backup Now) before trying anything unusual.

## The application will not start
| You see | Meaning / fix |
|---|---|
| `Please run scripts\setup.bat first` | One-time set-up was not done. Run `bash scripts/setup.sh`. |
| "Another copy of ABHARANAM COLLECTIONS is already using this data folder" | It is already running (look for another black window). Close it. If none is open and the message stays, restart the computer. |
| "Address already in use" / port 8000 busy | Another program uses 8000. In `backend/.env` set `PORT=8001`, start again, open `http://localhost:8001`. |
| `python` / `node` "is not recognized" | Reinstall Python (tick **Add to PATH**) / Node.js, then open a **new** Git Bash. |
| The browser page is blank after an update | Rebuild the screens: `cd frontend && npm run build`, then restart. |

## Login problems
* **Forgot the password:** close the app, run `bash scripts/reset_password.sh` (Git Bash), follow the prompts.
* **"Too many wrong attempts"** — wait 5 minutes.
* **"Your session is no longer valid"** — you were signed out because an admin changed your account or password. Sign in again.
* **"You do not have permission"** — ask the Admin to tick that permission for you.

## Data problems
* **"xxx.json appears to be corrupted. Please restore a backup."** — a data file cannot be read (e.g. the computer lost power while another program edited it, or someone edited it by hand). Nothing was overwritten. Go to *Administration → Backup & Restore*, choose the **newest backup**, restore. Then re-enter what happened since that backup. *Data Health* shows exactly which file.
* **"The app stopped in the middle of saving last time…"** — the computer was switched off during a save. The unfinished save was undone automatically; check the last thing you entered.
* **Data Health shows "Stock matches stock history" problems** — a stock quantity was changed outside the software. Restore a backup, or make a correcting *Adjust stock* entry with a remark.
* **Numbers look wrong** — check the date range/filters at the top of the report. Cancelled sales/expenses are not counted.

## Barcodes
* Scanner does nothing → click in the SCAN BARCODE box; check the scanner's cable/battery; scan into Notepad to confirm it "types".
* "Unknown barcode" → the tag's code is not any product's SKU/barcode; open Barcode Search and type it.
* Labels off-centre / cut / turned → see `barcode-printing.md`: driver paper size 18 × 12 mm, margins None, scale 100%, try *Print sideways*.
* Tag prints but will not scan → *Barcode → Printer Test*, scan the 5 test tags and press *Use this width* on the best one; raise the printer darkness, lower its speed.

## Excel / import
* "That file cannot be read" → save the sheet as **.xlsx** (not .xls) or CSV.
* Import shows errors → download the **error report**; each line names the row and the problem. Nothing is imported until all rows are fine.
* An exported file will not open → make sure it finished downloading; copies are also in the `exports` folder.

## Invoice PDF shows "Rs." instead of ₹
The computer lacks the Arial font (Windows normally has it). Amounts are still correct.

## Slow?
Very large data (100,000+ stock movements) saves a little slower; see `local-storage.md`. Close other heavy programs; keep the project folder on an SSD, not a network drive.

## Where to look for technical details
`logs/app.log` — send the last lines to your developer. Never send your `.env` file.
