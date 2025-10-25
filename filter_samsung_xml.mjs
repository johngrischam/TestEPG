name: Filter SamsungTVPlus XML

on:
  schedule:
    - cron: "0 * * * *"
  workflow_dispatch:

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: "20"

      - name: Install deps
        run: npm install         # ✅ changed from npm ci

      - name: Filter XML
        run: node filter_samsung_xml.mjs

      - name: Commit & push filtered.xml
        run: |
          git config user.name "github-actions"
          git config user.email "actions@github.com"
          git add filtered.xml
          git commit -m "Auto update filtered SamsungTVPlus XML" || echo "No changes"
          git push

      - name: Purge jsDelivr cache (optional)
        run: |
          curl -s "https://purge.jsdelivr.net/gh/${{ github.repository }}/filtered.xml" || true

