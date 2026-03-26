# Chengdu 6F MUVS Real-time Dashboard

## Run

1. Copy `.env.example` to `.env` and fill in the SQL Server credentials.
2. Run `npm install`.
3. Run `npm start`.
4. Open `http://localhost:3036`.
5. Open `http://localhost:3036/board` for the operator-facing big screen board.
6. Open `http://localhost:3036/nav` for the navigation hub.

## Notes

- The backend only reads data through `dbo.GetPortState_Test`.
- The browser never connects to SQL Server directly.
- Default query window is the current day from `00:00:00` to now unless the UI filter overrides it.
- The operator board is bilingual (Chinese + English) and is tuned for 1-5 minute refresh intervals.
- API responses are cached in memory for 60 seconds by default to avoid unnecessary database load from multiple screens.

## Open On Another PC

1. `http://localhost:3036` only works on the same PC that is running `npm start`.
2. For another PC on the same factory LAN, open `http://<server-ip>:3036`, `http://<server-ip>:3036/board`, or `http://<server-ip>:3036/nav`.
3. The dashboard server must be running on the host PC, and Windows Firewall must allow inbound traffic on port `3036`.
4. The other PC must be able to reach the host PC over the local network.

## Install As A Long-Running Server Task

1. On the target server, copy the full `muvs-dashboard` folder.
2. Install Node.js on that server.
3. Create `.env` from `.env.server.example` and fill in the database settings.
4. Run `npm install`.
5. Run `powershell -ExecutionPolicy Bypass -File .\scripts\install-dashboard-task.ps1` as Administrator.
6. Reboot the server or manually start the scheduled task `MUVS-Dashboard`.
7. Open `http://localhost:3036/nav` on the server itself, or `http://<server-ip>:3036/nav` from another PC on the same LAN.

## Port Visibility Feature

- Both dashboards now support manually hiding specific ports.
- The selection is sent to the backend as `hiddenPorts`, so summaries and cards are recalculated only for visible ports.
- The backend applies this filter after cached base data is loaded, so hiding ports does not add extra database pressure.
- The hidden port selection is also stored in the browser, so the same PC keeps the preferred visible layout after refresh.

## Server Setup Tutorial

1. Prepare a Windows server or always-on PC that can reach the SQL Server and can be reached by shop-floor screens.
2. Install Node.js LTS.
3. Copy the whole `muvs-dashboard` folder onto the server, for example to `C:\Apps\muvs-dashboard`.
4. In that folder, create `.env` based on `.env.server.example`.
5. Fill in at least `DB_SERVER`, `DB_DATABASE`, `DB_USER`, `DB_PASSWORD`, `APP_PORT`, and optionally `APP_HOST=0.0.0.0`.
6. Open PowerShell as Administrator.
7. Run `cd C:\Apps\muvs-dashboard`.
8. Run `npm install`.
9. Test once with `npm start` and confirm that `http://localhost:3036/nav` opens correctly.
10. Stop the test process.
11. Run `powershell -ExecutionPolicy Bypass -File .\scripts\install-dashboard-task.ps1`.
12. Confirm that the scheduled task `MUVS-Dashboard` exists in Task Scheduler.
13. Confirm that TCP port `3036` is allowed in Windows Firewall.
14. Reboot the server or manually run the `MUVS-Dashboard` task.
15. From other PCs on the same LAN, open `http://<server-ip>:3036/nav`.
16. Use `/` for the main dashboard and `/board` for the operator board.

### If `npm` is not recognized on the server

1. Confirm Node.js LTS is installed.
2. Close and reopen PowerShell after installation.
3. Try `node -v` and `npm -v`.
4. If `npm` is still not found, try `& "C:\Program Files\nodejs\npm.cmd" install`.
5. If that works, add `C:\Program Files\nodejs\` to the system PATH.

## Environment Templates

- `.env.example`: minimal local development template.
- `.env.server.example`: recommended template for Windows server or factory LAN deployment.

## GitHub Pages

- GitHub Pages cannot run `server.js`, so it cannot safely connect to SQL Server or keep the database password hidden.
- You can publish only the static frontend to GitHub Pages, but it will not work unless the API is hosted somewhere else and configured for cross-origin access.
- For production inside the factory, the practical options are a local Windows host, an internal VM/server, IIS reverse proxy, or Docker on an internal machine.

## Impact Of Future Function Changes

- Both dashboards use the same backend endpoint, and that endpoint reads from `dbo.GetPortState_Test`.
- If you change only the internal calculation logic of the procedure while keeping the same output columns and meanings, both dashboards will update automatically and continue to work.
- If you rename, remove, or change the meaning of returned columns such as `TotalPutBags`, `TotalPutWeight`, `PutProgress`, `PortName`, or `CurrentMatName`, both dashboards will be affected.
- If you add new columns without removing existing ones, the dashboards will not break, and I can later extend the UI to use the new fields.