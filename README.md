# Quality Measurement

A website for entering project details, weekly and release metrics, and generating quality measurement reports. It includes RAG scoring, QA and Development scores, trend charts, HTML/CSV exports, print-to-PDF layouts, scoring methodology, and a metrics reference.

An optional Jira connection retrieves weekly defect activity and cumulative Overall statistics, with searchable field filters, custom JQL, issue drill-downs, and CSV exports.

## Docker Setup

### Prerequisites

- Git to clone the repository.
- Docker Desktop, or Docker Engine with the Docker Compose plugin, running on your machine.
- Docker Compose **2.24.0 or newer**. The optional environment file uses the `required` option introduced in that version. See [Docker's environment-file documentation](https://docs.docker.com/compose/how-tos/environment-variables/set-environment-variables/).

Check your installation:

```sh
docker --version
docker compose version
```

Node.js 22 runs inside the container. No host Node.js installation, npm dependencies, or database is needed to run the website with Docker.

### Clone and Start

```sh
git clone https://github.com/roychow352DR/quality_measurement.git
cd quality_measurement
docker compose up --build -d --wait
```

Open [http://localhost:3000](http://localhost:3000).

Compose builds the image, starts the website in the background, and waits for its health check. Jira credentials are optional: the measurement builder and report pages work without them.

### Optional: Connect Jira

For a new installation, create a local credential file:

```sh
cp .env.jira.example .env.jira
```

Edit `.env.jira` with your Jira Cloud site URL, Atlassian account email, and API token:

```dotenv
JIRA_URL=https://your-company.atlassian.net
JIRA_USERNAME=your-email@example.com
JIRA_API_TOKEN=your-personal-api-token
```

Use an account that can browse the relevant projects and issues and read their status history. The application supports Jira Cloud sites ending in `.atlassian.net`. Its default project is `EFSGLYTY`; select your own **Space (Project)** or enter JQL on the Jira page. Weekly queries use the workflow names described in the [user guide](docs/USER_GUIDE.md#jira-defect-statistics).

On macOS or Linux, restrict access to the credential file:

```sh
chmod 600 .env.jira
```

Recreate the container after adding or changing credentials:

```sh
docker compose up --build -d --wait --force-recreate
```

Open [Jira Defect Statistics](http://localhost:3000/jira.html#jira), select fields or JQL, choose the reporting period, and click **Retrieve Data**. The same selection applies to Weekly and Overall statistics.

Credentials stay on the server and are not embedded in browser assets. Git ignores `.env` and `.env.*`, except the placeholder `.env.jira.example`. Docker excludes all `.env*` files from the build context. Never put real credentials in the example file.

To use an existing credential file outside the repository, create a local `.env` file with:

```dotenv
JIRA_ENV_FILE=/absolute/path/to/private/jira.env
```

That file must contain the same three Jira variables. `JIRA_ENV_FILE` takes precedence over `.env.jira`; remove or update the override if you want to use the file in this repository.

### Change the Port

Create or update `WEB_PORT` in the local `.env` file, preserving any existing `JIRA_ENV_FILE` entry:

```dotenv
WEB_PORT=3001
```

Then run:

```sh
docker compose up --build -d --wait
```

Open [http://localhost:3001](http://localhost:3001). Export a backup of your inputs before changing the address: each browser origin has separate storage.

### Manage and Update

```sh
# Check container status and health
docker compose ps

# Follow logs; Ctrl+C stops following logs, not the website
docker compose logs --follow website

# Restart the existing container
docker compose restart website

# Stop and remove the container
docker compose down
```

To get a newer version:

```sh
git pull --ff-only
docker compose up --build -d --wait
```

Application files are copied into the image. Rebuild after changing code; restarting alone does not apply source edits or changed environment variables.

### Storage and Local Access

- Project inputs and the latest generated report are saved in browser local storage for the current website address. They survive Docker restarts but are not stored in the container or shared across browsers or devices.
- Use **Back Up Inputs** to download JSON and **Import Inputs** to restore it. Clearing browser storage removes saved inputs.
- Jira query results are held temporarily in memory. They do not overwrite measurement inputs.
- Compose binds to `127.0.0.1` only; Jira API routes also enforce local access. This configuration is intended for use on your own machine.
- The container runs as the non-root `node` user with a read-only filesystem, dropped Linux capabilities, and a built-in `/health` check. No persistent Docker volumes are required.

### Troubleshooting

- **Cannot connect to Docker:** start Docker Desktop or the Docker daemon.
- **Compose rejects `env_file.required`:** update to Compose 2.24.0 or newer.
- **Port already allocated:** set `WEB_PORT` to a free port as described above.
- **Page unavailable:** check `docker compose ps`, `docker compose logs website`, and the browser's port.
- **Jira not configured:** check `.env.jira` or `JIRA_ENV_FILE`, then recreate the container. A missing optional credential file does not prevent the builder from starting.
- **Jira authentication or permission error:** check the site, account email, token, and project permissions, then recreate the container and refresh.
- **Jira rejects a query:** check project, issue types, and workflow status names. Use **Validate Query** and per-cell JQL details.
- **Code changes missing:** run `docker compose up --build -d --wait`, then reload the browser.

## Local Development

With Node.js 22 or newer installed on the host:

```sh
npm start
```

Stop Docker first if both use port 3000. To start locally with Jira credentials:

```sh
node --env-file=.env.jira server.mjs
```

Run syntax checks and tests:

```sh
npm run check
npm test
```

There are no npm dependencies to install. Tests cover scoring, reports, navigation, Jira queries, cumulative snapshots, CSV exports, and local API protections.

## Project Files

- `app.js`, `metrics.js`, `report.js`, `reference.js`: report builder, scoring, exports, and reference pages.
- `jira.js`, `jira-model.js`, `jira-overall.js`, `jira-service.mjs`: Jira interface, query rules, cumulative calculations, and server integration.
- `server.mjs`: HTTP server and local API routes.
- `index.html`, `styles.css`, `builder.css`, `jira.css`, `print.css`: layout, theme, and print styles.
- `measurement-source.pdf`, `metrics-source.pdf`: bundled measurement references.
- `Dockerfile`, `compose.yaml`, `.dockerignore`: container build and startup configuration.
- `.env.jira.example`: placeholder Jira configuration to copy and fill locally.
- `tests/`: automated checks.

See the [user guide](docs/USER_GUIDE.md) for detailed measurement definitions, scoring conventions, report behavior, and Jira counting rules.
