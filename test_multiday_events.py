"""Test multi-day event creation feature."""
from playwright.sync_api import sync_playwright
import time

def test_multiday_events():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        # Navigate to app
        print("[*] Navigating to app...")
        page.goto('http://localhost:5182')
        page.wait_for_load_state('networkidle')
        print("[OK] App loaded")

        # Test 1: Open create event modal by double-clicking a date
        print("[*] Opening create event modal...")
        date_cells = page.locator('.cal-cell')
        if date_cells.count() > 10:
            # Double-click a date cell in the middle of the calendar
            date_cells.nth(15).double_click()
            page.wait_for_selector('.modal-overlay', timeout=5000)
            print("[OK] Modal opened via double-click")
        else:
            print("[FAIL] Not enough date cells found")
            browser.close()
            return

        # Test 2: Fill in a multi-day event
        print("[*] Filling multi-day event form...")

        # Get the date that was clicked to set as start date
        title_input = page.locator('input[id="title"]')
        date_input = page.locator('input[id="date"]')
        end_date_input = page.locator('input[id="endDate"]')

        title_input.fill('Charlie Holiday')
        print("[OK] Title filled")

        # Set start date
        date_input.evaluate("el => el.value = '2026-03-20'")
        print("[OK] Start date set")

        # Set end date (3 days later)
        end_date_input.evaluate("el => el.value = '2026-03-25'")
        print("[OK] End date set")

        # Submit form
        submit_btn = page.locator('.btn-submit')
        submit_btn.click()
        page.wait_for_selector('.modal-overlay', state='hidden', timeout=5000)
        print("[OK] Modal closed after submission")

        # Test 3: Verify event appears on multiple days
        print("[*] Verifying event spans multiple days...")
        time.sleep(1)

        # Navigate to the month containing the event (Mar 2026)
        current_month = page.locator('.cal-title').text_content()
        print(f"[*] Current calendar view: {current_month}")

        # Check if the event appears on calendar
        event_cards = page.locator('.cal-event-card')
        if event_cards.count() > 0:
            print(f"[OK] Event card found ({event_cards.count()} visible)")

            # Check for date range display
            detail_dates = page.locator('.cal-detail-date')
            if detail_dates.count() > 0:
                print(f"[OK] Date display found: {detail_dates.first.text_content()}")
            else:
                print("[WARN] Date range display not visible")
        else:
            print("[WARN] No event cards found")

        # Test 4: Click on the event's start date to see the event detail
        print("[*] Clicking on event start date (Mar 20)...")

        # Find and click the date cell for Mar 20
        # We need to identify which cell is Mar 20 by its content
        all_cells = page.locator('.cal-cell')
        for i in range(all_cells.count()):
            cell = all_cells.nth(i)
            day_num = cell.locator('.cal-day-num').text_content() if cell.locator('.cal-day-num').count() > 0 else ''
            if day_num == '20':
                print(f"[*] Found Mar 20 cell at index {i}")
                cell.click()
                time.sleep(0.5)
                break

        # Check detail section
        detail_section = page.locator('.cal-detail')
        if detail_section.count() > 0:
            detail_text = detail_section.text_content()
            print(f"[OK] Event detail visible:\n{detail_text[:200]}")
        else:
            print("[WARN] Event detail section not visible")

        # Test 5: Click on middle date (Mar 23) to verify event still appears
        print("[*] Clicking on middle date (Mar 23)...")

        all_cells = page.locator('.cal-cell')
        for i in range(all_cells.count()):
            cell = all_cells.nth(i)
            day_num = cell.locator('.cal-day-num').text_content() if cell.locator('.cal-day-num').count() > 0 else ''
            if day_num == '23':
                print(f"[*] Found Mar 23 cell at index {i}")
                cell.click()
                time.sleep(0.5)
                break

        detail_section = page.locator('.cal-detail')
        if detail_section.count() > 0:
            detail_text = detail_section.text_content()
            if 'Charlie Holiday' in detail_text:
                print(f"[OK] Event appears on middle date (Mar 23)")
            else:
                print(f"[WARN] Event not in detail on Mar 23: {detail_text[:100]}")
        else:
            print("[WARN] Event detail not visible on Mar 23")

        # Test 6: Click on end date (Mar 25) to verify event appears
        print("[*] Clicking on end date (Mar 25)...")

        all_cells = page.locator('.cal-cell')
        for i in range(all_cells.count()):
            cell = all_cells.nth(i)
            day_num = cell.locator('.cal-day-num').text_content() if cell.locator('.cal-day-num').count() > 0 else ''
            if day_num == '25':
                print(f"[*] Found Mar 25 cell at index {i}")
                cell.click()
                time.sleep(0.5)
                break

        detail_section = page.locator('.cal-detail')
        if detail_section.count() > 0:
            detail_text = detail_section.text_content()
            if 'Charlie Holiday' in detail_text:
                print(f"[OK] Event appears on end date (Mar 25)")
            else:
                print(f"[WARN] Event not in detail on Mar 25")
        else:
            print("[WARN] Event detail not visible on Mar 25")

        print("\n[OK] All tests completed")
        page.screenshot(path='/tmp/multiday_test.png', full_page=True)
        print("[OK] Screenshot saved to /tmp/multiday_test.png")

        browser.close()

if __name__ == '__main__':
    test_multiday_events()
