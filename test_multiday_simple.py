"""Simple test to debug multi-day event feature."""
from playwright.sync_api import sync_playwright
import time

def test():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        print("[*] Navigating to app...")
        page.goto('http://localhost:5182')
        page.wait_for_load_state('networkidle')
        time.sleep(2)
        print("[OK] App loaded")

        # Check what's rendered
        page.screenshot(path='/tmp/debug.png', full_page=True)
        print("[OK] Screenshot saved")

        # Check calendar structure
        calendar = page.locator('.cal')
        if calendar.count() > 0:
            print("[OK] Calendar found")
        else:
            print("[FAIL] Calendar not found")

        # Count date cells
        cells = page.locator('.cal-cell')
        print(f"[*] Found {cells.count()} calendar cells")

        if cells.count() > 0:
            # Try to see what's in a cell
            first_cell_text = cells.first.text_content()
            print(f"[*] First cell content: {first_cell_text[:50]}")

        # Check if modal elements exist
        modal = page.locator('.modal-overlay')
        print(f"[*] Modal overlays found: {modal.count()}")

        # Try clicking first cell to see what happens
        if cells.count() > 10:
            print("[*] Clicking cell 15...")
            cells.nth(15).click()
            time.sleep(1)

            modal_count = page.locator('.modal-overlay').count()
            print(f"[*] Modal overlays after click: {modal_count}")

            if modal_count > 0:
                # Try to fill form
                title = page.locator('input[id="title"]')
                print(f"[*] Title input found: {title.count()}")

                if title.count() > 0:
                    title.fill('Test Event')
                    date = page.locator('input[id="date"]')
                    end_date = page.locator('input[id="endDate"]')
                    print(f"[*] Date inputs found: {date.count()}, {end_date.count()}")

        browser.close()

if __name__ == '__main__':
    test()
