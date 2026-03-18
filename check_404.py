#!/usr/bin/env python3
"""Check which resource is failing with 404"""

from playwright.sync_api import sync_playwright
import time

with sync_playwright() as p:
    browser = p.chromium.launch(headless=False)
    page = browser.new_page()

    failed_requests = []
    def handle_response(response):
        if response.status >= 400:
            failed_requests.append({
                'url': response.url,
                'status': response.status,
                'method': response.request.method
            })

    page.on('response', handle_response)

    print("Navigating to app...")
    page.goto('http://localhost:5179')
    page.wait_for_load_state('networkidle')

    print(f"\nFound {len(failed_requests)} failed requests:")
    for req in failed_requests:
        print(f"  {req['status']} {req['method']} {req['url']}")

    # Also check the HTML structure
    print("\n\nDOM Structure (first 100 chars of body):")
    body_html = page.locator('body').inner_html()
    print(body_html[:500])

    print("\n\nChecking for data attributes or imports...")
    imports = page.evaluate("() => Object.keys(window).filter(k => !k.startsWith('webkit'))")
    print(f"Window properties: {imports[:20]}")

    browser.close()
