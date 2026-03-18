#!/usr/bin/env python3
"""Test that tab navigation horizontal scrolling works on mobile"""

from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch(headless=False)

    # Test 1: Desktop viewport (should not scroll, tabs may wrap)
    print("=" * 60)
    print("TEST 1: Desktop Viewport (1024px)")
    print("=" * 60)
    page = browser.new_page(viewport={'width': 1024, 'height': 768})
    page.goto('http://localhost:5179')
    page.wait_for_load_state('networkidle')

    tab_nav_computed = page.evaluate("""() => {
        const el = document.querySelector('.tab-nav');
        if (!el) return {error: 'tab-nav not found'};
        const style = window.getComputedStyle(el);
        return {
            overflowX: style.overflowX,
            overflowY: style.overflowY,
            scrollBehavior: style.scrollBehavior,
            flexWrap: style.flexWrap,
            width: el.offsetWidth,
            scrollWidth: el.scrollWidth,
            canScroll: el.scrollWidth > el.offsetWidth
        };
    }""")

    print("Tab nav computed styles:")
    for key, val in tab_nav_computed.items():
        print(f"  {key}: {val}")

    page.close()

    # Test 2: Mobile viewport (320px - very narrow)
    print("\n" + "=" * 60)
    print("TEST 2: Mobile Viewport (320px)")
    print("=" * 60)
    page = browser.new_page(viewport={'width': 320, 'height': 667})
    page.goto('http://localhost:5179')
    page.wait_for_load_state('networkidle')

    tab_nav_mobile = page.evaluate("""() => {
        const el = document.querySelector('.tab-nav');
        if (!el) return {error: 'tab-nav not found'};
        const style = window.getComputedStyle(el);
        const tabs = document.querySelectorAll('.tab-btn');
        return {
            overflowX: style.overflowX,
            webkitOverflowScrolling: style.webkitOverflowScrolling,
            scrollBehavior: style.scrollBehavior,
            flexWrap: style.flexWrap,
            navWidth: el.offsetWidth,
            navScrollWidth: el.scrollWidth,
            canScroll: el.scrollWidth > el.offsetWidth,
            tabCount: tabs.length,
            totalTabWidth: Array.from(tabs).reduce((sum, t) => sum + t.offsetWidth, 0),
            firstTabShrink: window.getComputedStyle(tabs[0]).flexShrink,
            firstTabWhiteSpace: window.getComputedStyle(tabs[0]).whiteSpace
        };
    }""")

    print("Tab nav on mobile (320px):")
    for key, val in tab_nav_mobile.items():
        print(f"  {key}: {val}")

    # Check if scrolling is needed and available
    if tab_nav_mobile['canScroll']:
        print("\n✓ PASS: Tab nav CAN scroll (scrollWidth > width)")
    else:
        print("\n✗ FAIL: Tab nav CANNOT scroll")

    if tab_nav_mobile['overflowX'] == 'auto':
        print("✓ PASS: overflow-x is 'auto'")
    else:
        print(f"✗ FAIL: overflow-x is '{tab_nav_mobile['overflowX']}', should be 'auto'")

    if tab_nav_mobile['webkitOverflowScrolling'] == 'touch':
        print("✓ PASS: -webkit-overflow-scrolling is 'touch'")
    elif tab_nav_mobile['webkitOverflowScrolling'] == '':
        print("⚠ WARNING: -webkit-overflow-scrolling not set (might be fine)")
    else:
        print(f"⚠ INFO: -webkit-overflow-scrolling is '{tab_nav_mobile['webkitOverflowScrolling']}'")

    if tab_nav_mobile['flexWrap'] == 'nowrap':
        print("✓ PASS: flex-wrap is 'nowrap'")
    else:
        print(f"✗ FAIL: flex-wrap is '{tab_nav_mobile['flexWrap']}', should be 'nowrap'")

    if tab_nav_mobile['firstTabShrink'] == '0':
        print("✓ PASS: tab buttons have flex-shrink: 0")
    else:
        print(f"⚠ INFO: tab flex-shrink is '{tab_nav_mobile['firstTabShrink']}'")

    if tab_nav_mobile['firstTabWhiteSpace'] == 'nowrap':
        print("✓ PASS: tab buttons have white-space: nowrap")
    else:
        print(f"⚠ INFO: tab white-space is '{tab_nav_mobile['firstTabWhiteSpace']}'")

    page.close()
    browser.close()

    print("\n" + "=" * 60)
    print("Test complete!")
    print("=" * 60)
