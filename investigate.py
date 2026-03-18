#!/usr/bin/env python3
"""
Systematic investigation of three reported issues:
1. Touch not working
2. Data not loading (messages, events)
3. Text escaping outside boxes
"""

from playwright.sync_api import sync_playwright
import json
import time

def investigate():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=False)  # Visual inspection
        page = browser.new_page()

        # Capture console messages to detect errors
        console_messages = []
        def log_console(msg):
            console_messages.append({
                'type': msg.type,
                'text': msg.text,
                'location': msg.location
            })
        page.on('console', log_console)

        # Capture errors
        page_errors = []
        def log_error(error):
            page_errors.append(str(error))
        page.on('pageerror', log_error)

        print("\n" + "="*60)
        print("PHASE 1: ROOT CAUSE INVESTIGATION")
        print("="*60)

        # ===== ISSUE 1: DATA LOADING =====
        print("\n[1/4] Navigating to app...")
        page.goto('http://localhost:5179')
        page.wait_for_load_state('networkidle', timeout=10000)

        print("[2/4] Checking console for errors...")
        time.sleep(1)

        if console_messages:
            print(f"\nConsole Messages ({len(console_messages)}):")
            for msg in console_messages:
                print(f"  [{msg['type'].upper()}] {msg['text']}")

        if page_errors:
            print(f"\nPage Errors ({len(page_errors)}):")
            for error in page_errors:
                print(f"  {error}")

        # ===== ISSUE 2: DATA NOT LOADING =====
        print("\n[3/4] Checking DOM for data elements...")
        page.screenshot(path='/tmp/app_state.png', full_page=True)
        print("  Screenshot saved: /tmp/app_state.png")

        # Check for message containers
        messages_locator = page.locator('[data-testid*="message"], .message, [class*="message"]')
        messages_count = messages_locator.count()
        print(f"\n  Message elements found: {messages_count}")

        # Check for event/calendar elements
        events_locator = page.locator('[data-testid*="event"], .event, [class*="event"]')
        events_count = events_locator.count()
        print(f"  Event elements found: {events_count}")

        # Check for data loading indicators
        spinners = page.locator('[class*="load"], [class*="spin"], [data-testid*="load"]')
        print(f"  Loading indicators: {spinners.count()}")

        # Get page content to inspect structure
        content = page.content()

        # Check for API calls or fetch errors in network
        print("\n[4/4] Inspecting rendered HTML structure...")

        # Look for common data containers
        has_messages_container = 'messages' in content.lower() or 'message' in content.lower()
        has_events_container = 'event' in content.lower() or 'calendar' in content.lower()

        print(f"  Has 'messages' in HTML: {has_messages_container}")
        print(f"  Has 'events'/'calendar' in HTML: {has_events_container}")

        # ===== ISSUE 3: TEXT ESCAPING =====
        print("\n[ISSUE 3] Checking for text overflow/escaping...")

        # Get all text containers
        text_elements = page.locator('p, span, div, button, h1, h2, h3, h4, h5, h6')
        print(f"  Total text elements: {text_elements.count()}")

        # Check for overflow properties
        overflow_issues = page.evaluate("""() => {
            const issues = [];
            document.querySelectorAll('*').forEach(el => {
                const style = window.getComputedStyle(el);
                const text = el.textContent;
                const width = el.offsetWidth;
                const scrollWidth = el.scrollWidth;

                if (scrollWidth > width && scrollWidth - width > 10) {
                    issues.push({
                        tag: el.tagName,
                        text: text.substring(0, 50),
                        width: width,
                        scrollWidth: scrollWidth,
                        overflow: style.overflow,
                        textOverflow: style.textOverflow,
                        whiteSpace: style.whiteSpace
                    });
                }
            });
            return issues;
        }""")

        if overflow_issues:
            print(f"\n  Found {len(overflow_issues)} elements with text overflow:")
            for issue in overflow_issues[:5]:  # Show first 5
                print(f"\n    Tag: {issue['tag']}")
                print(f"    Text: {issue['text'][:40]}...")
                print(f"    Width: {issue['width']}px, ScrollWidth: {issue['scrollWidth']}px")
                print(f"    Overflow: {issue['overflow']}, TextOverflow: {issue['textOverflow']}")
                print(f"    WhiteSpace: {issue['whiteSpace']}")
        else:
            print("\n  No major text overflow issues detected")

        # ===== ISSUE 1 DETAILED: TOUCH EVENTS =====
        print("\n[ISSUE 1] Checking touch event support...")

        touch_support = page.evaluate("""() => {
            return {
                hasTouch: 'ontouchstart' in window,
                hasPointer: 'PointerEvent' in window,
                maxTouchPoints: navigator.maxTouchPoints || 0,
                userAgent: navigator.userAgent.substring(0, 100)
            };
        }""")

        print(f"\n  Touch Support:")
        print(f"    ontouchstart event: {touch_support['hasTouch']}")
        print(f"    PointerEvent: {touch_support['hasPointer']}")
        print(f"    Max touch points: {touch_support['maxTouchPoints']}")

        # Check for touch event listeners on interactive elements
        touch_listeners = page.evaluate("""() => {
            const elements = [];
            document.querySelectorAll('button, a, [onclick], .clickable').forEach(el => {
                const listeners = getEventListeners ? getEventListeners(el) : null;
                const html = el.outerHTML.substring(0, 100);
                elements.push({
                    tag: el.tagName,
                    html: html,
                    hasOnClick: !!el.onclick,
                    hasOnTouchStart: !!el.ontouchstart
                });
            });
            return elements.slice(0, 10);
        }""")

        print(f"\n  Interactive elements ({len(touch_listeners)} sampled):")
        for el in touch_listeners:
            print(f"    {el['tag']}: onClick={el['hasOnClick']}, onTouchStart={el['hasOnTouchStart']}")

        # ===== SUMMARY =====
        print("\n" + "="*60)
        print("INVESTIGATION SUMMARY")
        print("="*60)

        print(f"\n✓ Console messages captured: {len(console_messages)}")
        print(f"✓ Page errors captured: {len(page_errors)}")
        print(f"✓ Message elements: {messages_count}")
        print(f"✓ Event elements: {events_count}")
        print(f"✓ Text overflow issues: {len(overflow_issues)}")
        print(f"✓ Touch support: {touch_support['hasTouch']}")

        print("\nNext steps: Review screenshot and console output to identify root causes")

        browser.close()

if __name__ == '__main__':
    investigate()
