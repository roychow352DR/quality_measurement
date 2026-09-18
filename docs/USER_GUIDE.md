# Quality Measurement User Guide

Enter project details, weekly measurements, and release live values to generate a measurement report. Source RAG thresholds come from **EQ-Measurement Metrics-110926-043342.pdf**, pages 6–8; UAT Discovery Rate uses agreed internal pilot bands; the reference is available inside the website.

## Docker Setup

See the [Docker setup README](../README.md#docker-setup) for installation, Jira configuration, startup, and troubleshooting.

## Use the builder

1. **Project Details:** enter the project name, QA owner, release date, and optional notes. **Reset** clears these four fields and saves the empty values; weekly and release measurements remain available. An existing report remains a snapshot and is marked out of date when the details change.
2. **Weekly Metrics:** optionally add testing weeks, dates, and nine weekly values (eight scored metrics plus informational P0/P1 discovery counts). The optional Weekly Trend Measurements section is removed. Saved or imported overall-created counts remain available to the comparison chart; unavailable values appear as gaps. Escaped P0/P1 counts use the scored week-end field (previously labeled Open P0/P1). Fixed rate, failed rate (reopened rate), and score use the existing weekly measurements. Existing supplementary trend data remains in input backups. Dates must be valid and non-overlapping. Up to 104 weeks are supported. **Reset** asks for confirmation, then clears the selected week’s dates, scored values, trend inputs, and previous measurements while keeping that week in the list. Cancel leaves its data unchanged. Other weeks, project details, release measurements, and any generated snapshot are retained. **Reset all weeks**, in the page header, asks for confirmation before removing every weekly record and returning this page to its empty state. It retains project details, release values, and the existing report snapshot. The button is disabled when no weeks exist. Weekly page body text, labels, inputs, and buttons use 12px type; the page title and headline score retain their hierarchy.
3. **Release Metrics:** review 20 metrics: 19 scored metrics (including UAT Discovery Rate) and the informational calculated weekly P0/P1 discovery average. Expand “RAG thresholds” for the exact applicable ranges. Percentages are entered directly (e.g. `95.5`). UAT Discovery Rate takes confirmed first-discovery counts for all pre-UAT stages and UAT, plus P0/P1 UAT counts and optional root-cause notes. All three counts are required for a UAT score; missing counts remain N/A. Leave unavailable values blank. Metrics retain their original component groups, with QA / Development labels beside each metric. Each of the five components has a **Reset** button with confirmation. It clears only that component’s values (including UAT inputs, notes, and historical comparison values; calculated weekly averages are retained), refreshes live scores, and saves the cleared state. Other components, weekly records, project details, and the existing report snapshot are retained.
4. **Generate report:** required project details and all entered values are validated. At least one scored metric is required. The report includes Overall RAG Score, QA Score, Development Score, coverage, scored weekly and release metrics, trend charts, and the applied scoring rules. Informational metric rows and the discovery overview are omitted from the generated report. Its applied thresholds and metric exports include scored metrics only; the dedicated Scoring Methodology table also lists scored metrics only (8 weekly and 19 release metrics).
5. **Download:** save a standalone HTML report or CSV data, or use **Print / Save PDF** in a browser with printing support. The HTML download contains its own styles and works offline. The report preview and download use the same 12px Arial/Helvetica font stack, navy and teal palette, and visible QA owner and release date. Optional Google Fonts are loaded only by the builder page; export styles are embedded intact.

The current draft and latest generated report are saved automatically **in this browser, for this site address**. They survive a Docker restart, but are not stored in the container or shared with other users/devices. Clearing browser storage deletes them. **Back up inputs** downloads a JSON file; **Import inputs** restores it. New projects and replacement imports ask before overwriting a draft. Use separate backups to keep multiple projects.

Reports are snapshots. Editing values does not silently change the generated report; a notice prompts you to regenerate it. Downloads use the displayed snapshot. Reports with unmeasured metrics display N/A and coverage rather than implying those metrics passed.

## Scoring conventions

- Individual measures: Green = 100 points, Amber = 60, Red = 0. Defect Density contributes its measured sub-measure average as one score.
- Per-week and release health: total points divided by the actual number of measured metrics. Green ≥ 85, Amber ≥ 60 and < 85, Red < 60. Classification uses the unrounded value; scores display exactly one decimal place.
- **Average weekly operational health = sum of individual measured week scores ÷ number of measured weeks.** Each measured week has equal weight, regardless of how many of its metrics are filled. Entirely unmeasured weeks are excluded; measured weeks scoring zero are included. Scores are not rounded before averaging.
- Release health averages the measured release metrics. Overall health pools individual weekly and release metric observations with equal weight per observation. The overall score and weekly average therefore use distinct, explicitly labeled denominators.
- Blank values are excluded. Zero is a measured value. Trend counts / aging are informational and do not receive scores.
- The source lists 20 release metrics but uses 19 in an example. The denominator is calculated dynamically.
- Decimal gaps in the source ranges are continuous: pass rate 94.5%, leakage 5.5%, and man-days density 0.205 are Amber. No input rounding is used before classification.
- Discovery counts and their derived weekly average remain informational and excluded from scores and scored-coverage denominators. UAT Discovery Rate is scored once under the internal pilot rules below. Defect Density uses the composite described below; other metrics retain their previous behavior.
- Fixed rate may exceed 100%. Other percentages must be 0–100. Counts must be non-negative integers; averages and days allow decimals.
- Weekly reopened rate is reopened in week ÷ tested in week × 100%; weekly aging is the average age of open P0/P1 defects at week-end. The release formulas remain ambiguous. Users supply measured live values directly; those values are not derived automatically.
- Release product-quality measurements represent the first 14 days after release. Other release measurements use their final release values. The application does not infer missing measurements or elapsed observation periods.

The **Loyalty Migration example** uses the original weekly P0/P1-created counts, escaped P0/P1 counts, fixed rates, and reopened rates. Escaped counts populate the renamed week-end field. Aging remains N/A because the original report does not provide it. Scores are recalculated under the current rules.

## Files

- `metrics.js`: metric definitions, thresholds, validation, score aggregation, JSON schema handling, and example data.
- `report.js`: escaped report rendering, standalone HTML, and CSV export with spreadsheet formula protection.
- `app.js`: navigation, forms, live scoring, local draft persistence, and snapshot workflow.
- `styles.css`, `builder.css`: responsive UI and report styles.
- `print.css`: shared A4 pagination for the website and downloaded HTML, with repeated page headers, page numbers, compact 12px tables, and headings kept with their content.
- `server.mjs`: static HTTP server with `/health` endpoint and public-file allowlist.
- `Dockerfile`, `compose.yaml`: container build and local startup.
- `tests/metrics.test.js`: scoring, validation, persistence, and export checks.

## Development / verification

For local development with Node 22+:

```sh
npm start
npm run check
npm test
```

Stop Docker first if using the same port, or use `PORT=3001 npm start`.

The site uses optional Google Fonts with system fallbacks. There are no analytics. User-entered measurements stay in the browser; the optional Jira integration reads data through the server. The JSON backup is the portable source of entered data; HTML / CSV reports are generated outputs.

## September 11 weekly-metrics update

Weekly metrics now include P0/P1 created (Green ≤ 2, Amber 3–5), week-end escaped P0/P1 (Green ≤ 2, Amber 3–5), average aging (Green ≤ 3 days, Amber > 3 through 7), fixed rate (Green ≥ 100%, Amber 80–<100%), and reopened rate (Green ≤ 5%, Amber >5–10%). Other values are Red. The four test/process thresholds and all release metrics are unchanged.

JSON schema version 3 accepts version 1 and 2 backups. Removed weekly incident, escaped, and hotfix values are retained as `legacyValues`, visible under “Previous weekly measurements”, and included in JSON backups. They are excluded from scores. The weekly `open` storage key is retained with the new label **Escaped P0/P1 defects (week-end)**, so existing measurements continue to appear in the form and now supply the escaped chart and chart-data table. Historical separate escaped trend inputs remain under “Previous weekly measurements” and in backups, but no longer drive charts. New fields otherwise stay blank. Existing generated reports require regeneration; the pre-update saved state is also retained in a versioned browser-storage archive when storage is available.

## Generated report presentation

Reports include exactly five chart panels with distinct colors: overall-created versus P0/P1-created (blue, with two series), escaped P0/P1 (orange), fixed rate (teal), failed rate using reopened rate (pink), and weekly score (purple). Missing values remain gaps; measured zeroes are plotted. Empty datasets show “Not measured”. X-axis labels show complete week periods (e.g. `Jun 1 - Jun 5`), with years added for reports spanning multiple years. Labels are angled and thinned for long reports; all measurements remain plotted and listed in chart data. Chart data and a per-week score summary are also included in the CSV.

Report body text, metric tables, legends, RAG labels, and methodology use 12px type in the preview, standalone HTML, and print styling. Chart axes use smaller 10px type. Headings and headline scores retain their visual hierarchy. Each weekly detail header highlights its Score and RAG label. Applied thresholds are separated into Weekly operational and Release summary, then grouped by component. Threshold columns use green, amber, and red labels and backgrounds, alongside text labels and point values.

The entire website uses a shared professional navy and teal theme: navy `#18344F`, teal `#167C80`, cool gray backgrounds, and white panels. Charts retain five distinct, coordinated colors. RAG colors retain their Green / Amber / Red meaning. The palette is shared by navigation, project and metric forms, buttons, dialogs, report preview, downloaded HTML, and print output; saved measurements and scoring rules are unchanged.

Project Details, Weekly Metrics, and Release Metrics share 12px body text, labels, inputs, buttons, and helper text. Main page titles and headline scores remain larger. Desktop menu labels use 12px navy text with a navy active item, white active text, and teal accents; mobile navigation retains its compact icon layout.

Print uses A4 with 14mm margins, a navy/teal palette, and 12px report text. Weekly and release metric rows have 6px top and bottom padding; summary, chart-data, and threshold rows have 8px. The screen layout is unchanged. Charts print in two columns, weekly tables stay intact when they fit, and release and methodology sections start on a new page. Current Chromium browsers use the report’s own page headers and page numbers. Print at 100% scale for the verified layout.

## QA and Development perspectives

Each metric has one primary perspective. QA labels four weekly and eight release metrics (including the scored UAT discovery rate): functional/regression testing, test completion, leakage, automation coverage/reliability, and UAT discovery rate. Development labels five weekly and twelve release metrics (including unscored weekly discovery counts and their derived average): defect flow, backlog, fix effectiveness, production defects, stability, incidents, hotfixes, and density. Generated weekly report details group metrics by perspective. The generated release summary uses its four original component tables plus Defect Density with classification labels, and retains the separate QA and Development score cards. The Weekly Metrics and Release Metrics input pages keep their original two weekly components and five release components, including Defect Density, respectively, with classification labels only. Applied thresholds retain Weekly operational and Release summary sections with the original component groups and classification labels. Teal QA and navy Development labels are separate from the RAG colors.

**QA Score** and **Development Score** each pool all measured weekly and release entries assigned to that perspective: total points divided by the number of scored observations. They use the existing unrounded Green/Amber/Red thresholds, exclude missing/invalid values, and include measured zeroes. Scope-specific perspective scores in report detail sections cover only that week or release. Input pages retain their single week/release health score strip. Overall RAG Score retains its existing calculation, pooling both perspectives' observations; it is not the simple average of the two perspective scores when their counts differ. The weekly operational average still gives each measured week equal weight.

Supplementary and historical trend inputs are labeled Development and remain unscored. Each scored metric is counted once in its primary perspective. For example, if the only measured QA entries are functional pass rate (Green, 100 points) and regression pass rate (Amber, 60 points), QA Score is (100 + 60) / 2 = 80.0. An escaped-defect entry assigned to Development contributes only to Development Score; points are not split or duplicated. Classification reflects the agreed improvement focus and assumes QA owns the test suites; these are quality indicators, not team performance rankings. Current backups and saved snapshots remain compatible because classification is derived from metric definitions; no saved input keys or metric thresholds changed. HTML, CSV, and print exports include the same classifications and scores.

## Generated Report filters

Use the Label and Component dropdowns above the generated report. Labels are All labels, QA, and Development. Components are the existing metric component names. A metric must match both selected filters.

Filters apply to weekly and release metric tables and applied thresholds. Empty components are omitted and the report shows a matching-entry count, including unmeasured entries. Clear filters restores all entries. All five trend charts and their chart-data view always include every original week, even when no metrics match the filters. Summary scores, RAG, coverage, and weekly score summaries also use all original measurements; active filters explain this scope.

HTML, CSV, and Print / Save PDF follow the active filters and identify the filtered view. Downloaded HTML is a static view and works offline. CSV retains full-report score summaries and all chart series, and filters its metric and supplementary trend rows. The filter controls themselves are hidden in print, while the active-filter explanation remains visible.

Filters do not change draft inputs or generated snapshots. Selections survive navigation and regeneration during the current page session; reload, New project, loading the example, or importing a new project resets them.

## Overall RAG table and methodology page

The **Overall RAG Score** table sits at the top of the generated report, below the project information and above the score cards. It shows the overall score with one decimal place, its calculation, and colored bands: Green ≥ 85 points, Amber ≥ 60 and < 85 points, and Red < 60 points. The matching band is highlighted with “Current status.” Amber therefore includes 60–84 whole points and decimals below 85. Status uses the unrounded value. Report filters leave this overall score unchanged; unmeasured scores show N/A with no highlighted band.

**Scoring Methodology** opens `/methodology.html` in the current tab from the workspace menu, page header, release helper, or generated report. The page explains metric points, weekly averaging, overall and perspective calculations, chart definitions, and source interpretations. Its threshold tables include every scored metric, grouped by weekly/release scope and component. It is rendered from the same definitions as the report and does not access or save project data.

The generated report includes only the **Metric Reference** tables from Scoring Methodology, with filtered applied thresholds grouped by scope and component. The explanatory methodology text and rules/source footer are omitted from the report preview, standalone HTML and printed/PDF reports. The preview links to the dedicated Scoring Methodology page for the full calculation rules. The Overall RAG table remains at the top of the report.

## Trend visibility and section titles

The **Weekly Trends** heading includes a **Hide Trend Charts / Show Trend Charts** button. It hides or restores the five charts, their explanatory note, and the chart-data view together. It does not alter measurements, scores, or the metric-table filters. Visibility survives filtering, Clear filters, navigation, and regeneration during the current page session; reload or replacement of the project restores visible charts.

HTML and Print / Save PDF follow the visibility setting and omit the entire Weekly Trends section when hidden. The toggle is excluded from exports. CSV always includes all chart series. Report section and component headings use title capitalization, including Weekly Trends, Weekly Operational Metrics, Weekly Score Summary, Release Summary, and Metric Reference.

The **Weekly Operational Metrics** heading includes a separate **Hide Weekly Details / Show Weekly Details** button. It collapses or restores all individual week tables together while keeping the Weekly Score Summary visible. It follows the same session lifecycle as chart visibility and remains independent of the chart toggle. The button is only shown when weekly details match the filters. HTML and Print / Save PDF omit hidden weekly details and exclude the button; CSV retains the selected metric data. Hiding details does not change measurements or score calculations.

## Metrics Reference page

The **Metrics Reference** workspace link opens `/reference.html` in the current tab. This page replaces the direct PDF destination with tables containing all 9 weekly metrics, 5 trend items, 20 release metrics, and 3 defect-status definitions from the reference PDF. The same page is available at `/reference` and from Scoring Methodology.

Tables retain the original components and show each metric's definition/formula, measurement timing, and tool/source, with the website's QA and Development labels. Notes identify the updated weekly escaped-defect wording and the ambiguous release aging and reopened formulas. Unspecified trend sources are marked as such. RAG thresholds, Green targets, and health score calculations are omitted; Scoring Methodology remains available separately. The page is rendered by the server, works without JavaScript, uses the shared navy/teal theme and 12px table text, and does not access project data.

## Jira Defect Statistics

Open **Jira Defect Statistics** from the workspace menu, or visit `/jira.html`. The page retrieves live Jira data into **Weekly → All Priorities** and **Weekly → High Priority** tables, following the layout and query definitions in `EQ-Loyalty Migration defects stats-140926-073125.pdf`. Each table contains Created, Resolved (Ready for Deploy), Tested, QA Failed, and Escaped. Click a count to inspect matching issue keys, summaries, current priorities/statuses, and the exact JQL. Two additional columns calculate Defects Fixed Rate (Resolved ÷ Created × 100%) and Defects Reopened Rate (QA Failed ÷ Tested × 100%). The existing QA Failed count is the reopened numerator. Each rate uses its own row and priority group, retains full calculation precision, and displays one decimal place. Zero denominators or unavailable counts show N/A; values over 100% remain uncapped. Both rates are included in CSV exports. Jira issue links open in the current tab. The Jira Defect Statistics sidebar item is a normal link: regular clicks retain in-page navigation, while Cmd/Ctrl-click, middle-click, or the browser context menu can open it in a new tab. Closing a read-only Jira tab does not resave project inputs; only pending input edits are flushed on page exit. **Download Weekly CSV** exports the displayed weekly counts and retrieval errors. A separate **Overall** section and **Download Overall CSV** show cumulative week-end snapshots.

The initial view covers EFSGLYTY Bugs from June 1 to August 23, 2026. Choose a First Monday and Last Day spanning up to 26 Monday–Sunday weeks. Last Day may be any day on or after First Monday; a day before Sunday creates a partial final row. Query dates consistently follow the displayed row. Status history runs Monday 00:00 through Sunday 23:59 in the connected Jira account's timezone, or through Last Day for a partial week. Created uses Monday 00:00 up to, but excluding, the day after the row ends. Cross-month weeks belong to the month of their final day. The PENTEST exclusion is enabled by default and can be changed; it applies uniformly to every week and column.

**Fields mode** loads accessible Space (Project) names from Jira. Every field dropdown includes a case-insensitive search by option name or key. Search filters only the visible options: selected values remain selected when hidden, and the report query changes only when field selections are changed and retrieved. Space uses a single selection; other fields retain multiple selections. Search shows a message when no values match, Enter or Down Arrow moves focus to the first match, and Escape closes the dropdown. Type, Priority, Current Status, Component, Fix Version, and Epic support multiple selected values. Epic options show issue keys and summaries from the selected space; the filter uses `parent IN (...)` to select issues directly linked to any selected epic. Selecting an epic does not select the epic issue itself or indirectly linked subtasks. No selections means All for that field. Values within one field use OR (`IN`); different fields use AND. Changing the space reloads its issue types, statuses, components, versions, and epics, clears selections tied to the previous space, and retains only supported issue types. Empty lists and retrieval errors are shown explicitly. Field lists are cached on the server for five minutes.

**JQL mode** lets users enter any supported Jira fields, functions, or multi-project conditions as the base issue selection. This replaces the field selections. Switching to JQL initially copies the field query; **Use Field Selections as JQL** explicitly replaces the editor contents with those selections. Returning to Fields restores the field selections, without converting custom JQL back to selectors. Each weekly column combines the selected scope with its existing date and workflow rules. Creation-date predicates (`created` and `createdDate`, including quoted aliases, relative dates, and functions) apply only to **Created**. **Resolved**, **Tested**, **QA Failed**, and **Escaped** remove those predicates so issues created in earlier weeks remain eligible. Other issue filters and history predicates are retained. Nested boolean groups are simplified by dropping creation predicates and any empty groups; remaining branches retain their grouping. This applies in both date-handling modes. **Move Dates with Each Week** is the default JQL date handling. Calendar date operands in standard Jira date fields (`created`, `updated`, `resolved`, `due`, and their aliases) and history predicates (`DURING`, `AFTER`, `BEFORE`, `ON`) describe the first selected week and shift by seven days for each subsequent week. The whole report retains one reference Monday when issuing individual weekly requests, preventing week 2 and later from intersecting against the original week's dates. ISO and slash-separated dates, optional times, and month/year boundaries are supported. Date-like text in summaries, labels, and versions stays literal. Custom date fields and relative-date functions retain their original expressions. Choose **Fixed Dates** to keep literal dates unchanged; creation-date filters still apply only to Created. A top-level ORDER BY is removed and results use `created DESC`. Quotes, parentheses, length, and Jira query validity are checked before retrieving data. **Validate Query** checks all five queries for the first and last selected weeks using Jira's strict JQL parser; errors leave existing results intact. The rules still refer to the reference workflow statuses and may need adaptation for spaces using different workflows.

**Preview Weekly JQL** shows the first week's Created query while editing. **Retrieve Data** applies the selection to Weekly and Overall, and **Applied Query** identifies the scope behind the displayed tables. **Refresh Data** refreshes that applied scope. CSV includes the query mode, base JQL, date handling, reference week, and separate Created and activity scope JQL for each weekly row. Draft filters and JQL remain in memory during navigation; reload restores the default view. Queries are submitted to the local server as JSON, without placing the JQL in the browser address. The server uses only Jira's read and query-validation endpoints.

Counts represent distinct issues per cell, not transition events. An issue may appear in several columns or weeks. High Priority includes the current High and Highest priorities, highlighted in red. Created uses `status != CANCEL` to exclude issues currently in Cancel, replacing its former historical cancellation rule. Tested also excludes issues currently in Cancel. Escaped follows the reference's historical backlog status rule; it is not a production leakage rate or an exact week-end snapshot. The expandable explanation and per-cell JQL show these definitions. Live counts can differ from the saved PDF because dates are corrected and Jira issues may have changed.

The server retrieves every result page before returning a count. Zero is a successful empty result; an unavailable measurement displays N/A with its error. Requests have timeouts, bounded concurrency, and rate-limit retries. Successful results are cached in server memory for 60 seconds; **Refresh Data** requests fresh data. Browser navigation retains the table only for the current page session. Jira data does not populate or overwrite project inputs or generated report snapshots.

### Jira credentials for Docker

The website uses Jira's read-only search API through its Node server. Credentials stay on the server and are never embedded in browser files. Compose loads the private environment file named by `JIRA_ENV_FILE`, or an optional `.env.jira` file in this directory. A local `.env` may contain that path; machine-specific environment files are not committed to Git.

For a separate installation, copy `.env.jira.example` to `.env.jira`, fill in `JIRA_URL`, `JIRA_USERNAME`, and `JIRA_API_TOKEN`, and restrict that file's permissions. Use a Jira Cloud site URL such as `https://your-company.atlassian.net`. Alternatively, set `JIRA_ENV_FILE` to a private file outside the project. Rebuild/recreate with `docker compose up --build -d --wait` after changing configuration. All `.env*` files are excluded from the Docker image. Keep the existing localhost-only port binding; the Jira API routes accept local website requests only.

Implementation: `jira-model.js` defines filters and JQL, `jira-service.mjs` handles server-side retrieval, and `jira.js` / `jira.css` render the page. `tests/jira.test.js` covers query dates, pagination, counts, failures, throttling, credential isolation, and HTTP routes.

### Overall Jira Statistics

The **Overall** section follows the cumulative table layout in `EQ-EGM defects stats-140926-100419.pdf`, with **All Priorities** and **High Priority** tables. Its five columns are **Total Created**, **Outstanding**, **Tested**, **Resolved**, and **QA Failed**. Weekly / Overall jump buttons move to each section without changing the page route. The filters and refresh action apply to both sections; exports are separate to preserve each table's column definitions.

Each row is a snapshot through the last day of its displayed period in the connected Jira account's timezone. The following midnight is exclusive, so Sunday seconds and daylight-saving boundaries are handled correctly. First Monday chooses the first displayed row, not the earliest eligible creation date. Overall removes custom JQL creation predicates and adds `created < next-day midnight`; other filters and configured weekly/fixed date handling remain in force. Current priority determines High/Highest membership. Issues currently in Cancel are excluded from all Overall columns, matching the reference.

- **Total Created:** distinct issues created by the cutoff.
- **Outstanding:** status at the cutoff is outside Done, Ready for Deploy, Released Prod, QA Ready, QA In Progress, UAT Ready, UAT In Progress, and Cancel. This consistently uses historical week-end status; the PDF mixes historical and current-state rules.
- **Tested:** at least one transition into QA In Progress or UAT In Progress before the cutoff.
- **Resolved:** had reached Ready for Deploy, Released Prod, or Done before the cutoff, including an initial resolved status.
- **QA Failed:** had reached QA Failed or UAT Failed before the cutoff. Repeat failures count once.

Overall is calculated from unique issues and complete status histories, not from sums of weekly columns. Resolved, Tested and QA Failed can overlap with each other and Outstanding. Counts may differ from the PDF's saved values, especially where the document's rules are inconsistent or Jira data has since changed. Click a count to inspect the issue list, current status, **Status at Cutoff**, and JQL constrained to snapshot membership. CSV includes both priority groups, applied scope, cutoff timezone, counting rules and retrieval errors.

`POST /api/jira/overall` uses the existing local-only API protection and private server credentials. It reads each cutoff's issue cohort, unions the issues, then retrieves only status changelogs through Jira's paginated bulk history API (at most 1,000 issue IDs per batch). Issues with no status changes retain their initial/current status. Changelog dates are sorted and deduplicated. Search/history errors show unavailable measurements rather than partial counts, independently of Weekly retrieval. Successful reports are cached for 60 seconds; explicit refresh bypasses the cache, concurrent identical requests share work, and upstream requests retain the shared four-request concurrency limit.


## Defect Discovery and UAT Effectiveness

P0/P1 counts stay visible in Weekly Metrics with an **Informational** status and remain a source for report charts. Informational metric rows are omitted from generated report tables and their HTML/PDF and CSV metric exports; saved counts remain in backups and chart data. Discovering more defects does not reduce quality scores. Overall-created trend counts were already unscored. Average weekly P0/P1 created is read-only and derived from valid measured weekly counts; missing counts are excluded and measured zeroes included. The Release Metrics input page shows the numerator and measured-week denominator. The Loyalty example has 32 P0/P1 discoveries across 12 weeks, averaging **2.7**; its historical manually entered average of 3 remains in the backup but is not used.

**UAT Discovery Rate = UAT discovered defects ÷ (Pre-UAT discovered defects + UAT discovered defects) x 100%.** Use distinct confirmed defects for the same release and agreed scope; pre-UAT includes functional, integration, and regression stages. Exclude duplicates, cancelled non-defects, and changes outside the agreed requirements. Both counts are required; 0 / 0 is N/A. The internal pilot thresholds are Green ≤10% with ≤2 P0/P1 UAT discoveries (100 points), Amber >10% and ≤20% with ≤2 P0/P1 UAT discoveries (60 points), and Red >20% or >2 P0/P1 UAT discoveries (0 points). All three valid counts and a non-zero discovery total are required for scoring; missing counts give N/A and are excluded from the score denominator. The rate can display with a missing P0/P1 UAT count, but it cannot score. P0/P1 UAT discoveries must not exceed UAT discoveries. Notes explain scope changes, environment/data limitations, and missed test scenarios; a UAT finding is not automatically a QA failure.

Version 5 backups accept versions 1–4 and preserve historical `release.comparison` counts for verification. They never substitute regression-only counts for all pre-UAT discoveries. The `release.uatDiscovery` fields are `preUat`, `uat`, `criticalUat`, and `notes`. The P0/P1 UAT Discoveries input keeps the `criticalUat` storage key so saved counts remain compatible. The Loyalty example therefore retains Regression 1 / UAT 6 as historical context with its new rate blank. Supply validated totals explicitly: 20 pre-UAT, 6 UAT and 0 P0/P1 UAT discoveries give **23.1% · Red · 0 points**. The percentage and RAG use the unrounded ratio; display rounding never changes the band.

Existing saved reports use a previous rules version and must be regenerated; browser inputs are retained and the previous saved state is archived locally. HTML, print/PDF, CSV, methodology, and reference definitions use the revised treatment. No release gates, new automation targets, Jira query changes, or phase-based aggregation are introduced by this update.


UAT scoring uses **one** metric assigned to QA. It contributes once to QA, Release, and Overall; it does not change Development Score. P0/P1 UAT discoveries have no separate points or denominator entry. The P0/P1 UAT override makes this metric Red, not the entire project. For example, 95 pre-UAT / 5 UAT / 2 P0/P1 UAT discoveries gives **5.0% · Green · 100 points**; increasing the P0/P1 count to 3 gives **5.0% · Red · 0 points**. A confirmed P0/P1 defect first discovered in UAT stays in that count even after a fix: this is detection timing, not a release-readiness gate. Count confirmed P0/P1 defects first discovered during UAT. Display the raw counts and notes for small samples. Review these internal pilot targets after 3–5 comparable completed releases; they are not prescribed ISTQB or market benchmarks.

Rules version `2026-09-17.uat-v7` requires report regeneration so snapshots using the previous P0/P1 UAT cutoff cannot silently display stale scores. Input schema is version 5 and existing blank P0/P1 UAT counts stay blank; zero is never inferred.


## Defect Density

Release Metrics has a dedicated **Defect Density** component. Enter one common distinct confirmed defect count plus distinct executed test cases, agreed testable requirements in the release, and approved planned development man-days. Use the same release scope and measurement cutoff for all three measures. Count reopened defects once; exclude duplicates and rejected non-defects. Do not count test reruns as additional cases. Keep requirement granularity consistent and fix the approved effort baseline for the agreed scope. Fractional man-days are allowed; counts must be whole numbers.

The fixed provisional internal thresholds are:

- Test-case density = defects / distinct executed test cases: Green ≤ 0.05; Amber > 0.05 and ≤ 0.10; Red > 0.10.
- Requirements density = defects / agreed testable requirements: Green ≤ 0.20; Amber > 0.20 and ≤ 0.40; Red > 0.40.
- Man-days density = defects / approved planned development man-days: Green ≤ 0.20; Amber > 0.20 and ≤ 0.35; Red > 0.35.

Each measure receives 100, 60 or 0 points. **Overall Defect Density Score = sum of measured points / measured measures.** Raw ratios are not averaged and are not percentages. The unrounded average contributes exactly once to Development, Release and Overall scores. QA and weekly scores are unaffected. Composite RAG is Green ≥ 85, Amber ≥ 60 and < 85, Red < 60. Scores display one decimal place. Density live values display two decimal places; scoring uses the unrounded ratios.

Example (illustrative, not imported Loyalty data): 10 defects / 100 cases = 0.10 (60 points); 10 / 25 requirements = 0.40 (60); 10 / 50 planned man-days = 0.20 (100). Composite = 220 / 3 = **73.3 · Amber**.

Blank defect counts or missing/zero denominators are N/A. Measured zero defects with a positive denominator give 100 points. If one or two measures are available, the report displays **Partial** with the measured count and excludes missing measures from the denominator. No measured sub-measures means no composite score. Compare releases using the same measures. Thresholds are provisional internal targets, not industry or ISTQB benchmarks; case granularity, requirement granularity, estimation and testing thoroughness can influence the score without changing software quality.

Schema version 5 stores `release.density` as `{defects, testCases, requirements, manDays}`. Versions 1–4 migrate an old scalar density into `release.legacyDensity`, retained in backups and shown as historical context but excluded from scoring. No numerator, denominator or planned effort is inferred from that old ratio. The original Loyalty example therefore retains its 1.05 historical density and leaves the new measurements blank. Resetting Defect Density clears its four inputs and historical ratio without clearing other components.

The Generated Report, HTML/PDF, CSV, Scoring Methodology and Metrics Reference use the same formulas. Component and Development filters include the composite and its breakdown together; QA filters hide them without recalculating summary scores. CSV sub-measure rows are explicitly marked as breakdown data and are not separate scored observations. Regenerate existing reports to apply rules version `2026-09-17.uat-v7`.
