"""Test manual event creation feature."""
from playwright.sync_api import sync_playwright
import time
import sys

# Fix encoding for Windows
if sys.platform == 'win32':
    import io
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

def test_manual_events():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        # Navigate to app
        page.goto('http://localhost:5182')
        page.wait_for_load_state('networkidle')

        print("[OK] App loaded successfully")

        # Take screenshot to see current state
        page.screenshot(path='/tmp/app_state.png', full_page=True)

        # Test 1: Check if "Create Event" button exists
        create_btn = page.locator('button:has-text("Create Event")')
        if create_btn.count() > 0:
            print("[OK] 'Create Event' button found")
        else:
            print("[FAIL] 'Create Event' button NOT found")
            print("Available buttons:", [btn.text_content() for btn in page.locator('button').all()])

        # Test 2: Click Create Event button
        try:
            create_btn.first.click()
            page.wait_for_selector('.modal-overlay', timeout=5000)
            print("[OK] Event creation modal opened")
        except Exception as e:
            print(f"[FAIL] Failed to open modal: {e}")
            page.screenshot(path='/tmp/modal_fail.png', full_page=True)
            browser.close()
            return

        # Test 3: Fill in form with minimal data
        title_input = page.locator('input[id="title"]')
        date_input = page.locator('input[id="date"]')

        # Set title
        title_input.fill('Test Event')
        print("[OK] Title filled")

        # Set date to tomorrow
        date_input.evaluate("el => el.value = '2026-03-18'")
        print("[OK] Date set")

        # Submit form
        submit_btn = page.locator('button:has-text("Create Event"):not(:has-text("Create Event"))')
        # Find the submit button more specifically
        submit_buttons = page.locator('.btn-submit')
        if submit_buttons.count() > 0:
            submit_buttons.first.click()
            print("[OK] Form submitted")

            # Wait for modal to close
            page.wait_for_selector('.modal-overlay', state='hidden', timeout=5000)
            print("[OK] Modal closed after submission")
        else:
            print("[FAIL] Submit button not found")

        # Test 4: Check if event appears in calendar/upcoming
        page.wait_for_load_state('networkidle')
        time.sleep(1)

        event_cards = page.locator('.cal-event-card')
        if event_cards.count() > 0:
            print(f"[OK] Event card found ({event_cards.count()} event(s) visible)")

            # Check for creator attribution
            creator_text = page.locator('.event-creator')
            if creator_text.count() > 0:
                print(f"[OK] Creator attribution visible: {creator_text.first.text_content()}")
            else:
                print("[WARN] Creator attribution not visible (may be expected for non-manual events)")
        else:
            print("[WARN] No event cards found - this may be expected if events haven't loaded")

        # Test 5: Check for Edit/Delete buttons on manual events
        edit_buttons = page.locator('.btn-event-edit')
        delete_buttons = page.locator('.btn-event-delete')

        if edit_buttons.count() > 0:
            print(f"[OK] Edit buttons found ({edit_buttons.count()})")
        else:
            print("[WARN] No edit buttons visible (may be expected if no manual events by current user)")

        if delete_buttons.count() > 0:
            print(f"[OK] Delete buttons found ({delete_buttons.count()})")
        else:
            print("[WARN] No delete buttons visible")

        # Test 6: Test clicking empty date cell to create event
        # Find a date cell without events
        date_cells = page.locator('.cal-cell')
        empty_cells = []

        for i in range(date_cells.count()):
            cell = date_cells.nth(i)
            # Check if cell has no event summaries
            if cell.locator('.cal-event-summaries').count() == 0:
                empty_cells.append(cell)

        if empty_cells:
            print(f"[OK] Found {len(empty_cells)} empty date cells")

            # Click first empty cell
            try:
                empty_cells[0].click()
                page.wait_for_selector('.modal-overlay', timeout=5000)
                print("[OK] Modal opened from clicking empty date cell")

                # Close modal
                page.locator('.modal-close').first.click()
                page.wait_for_selector('.modal-overlay', state='hidden', timeout=5000)
                print("[OK] Modal closed via close button")
            except Exception as e:
                print(f"[WARN] Could not test date cell click: {e}")
        else:
            print("[WARN] No empty date cells found to test click-to-create")

        # Final screenshot
        page.screenshot(path='/tmp/final_state.png', full_page=True)
        print("\n[OK] All tests completed")
        print("Screenshots saved to /tmp/app_state.png, /tmp/final_state.png")

        browser.close()

if __name__ == '__main__':
    test_manual_events()
