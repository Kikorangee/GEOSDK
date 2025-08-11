(function () {
    const ENGINE_DIAG_PRIMARY = "DiagnosticEngineHoursAdjustmentId";
    const ENGINE_DIAG_FALLBACK = "DiagnosticEngineHoursId";
    const MAX_CALLS_PER_BATCH = 90;

    const $ = id => document.getElementById(id);
    const banner = (msg, cls = "info") => {
        const b = $("banner");
        b.className = "alert alert-" + cls;
        b.textContent = msg;
        b.classList.remove("d-none");
    };
    const clearBanner = () => { $("banner").classList.add("d-none"); };

    let api, credentials;

    $("connect").addEventListener("click", async () => {
        const server = $("server").value.trim();
        const database = $("database").value.trim();
        const username = $("username").value.trim();
        const password = $("password").value.trim();

        clearBanner();
        banner("Connecting…");

        try {
            api = new GeotabApi(server);
            credentials = await api.authenticate(username, password, database);
            banner("Connected!", "success");
            await runReport();
        } catch (err) {
            banner("Connection failed: " + err, "danger");
        }
    });

    async function runReport() {
        banner("Fetching DVIR logs…");
        const dvirLogs = await getAll("DVIRLog", {
            fromDate: new Date(new Date().setMonth(new Date().getMonth() - 1)).toISOString(),
            toDate: new Date().toISOString()
        });

        if (!dvirLogs.length) {
            banner("No DVIR logs found.", "warning");
            return;
        }

        // Unique device IDs
        const deviceIds = [...new Set(dvirLogs.map(d => d.device.id))];
        const fromDate = new Date(Math.min(...dvirLogs.map(d => new Date(d.dateTime).getTime())));
        const toDate = new Date(Math.max(...dvirLogs.map(d => new Date(d.dateTime).getTime())));

        banner("Fetching engine hours…");
        const engineHoursData = await fetchEngineHoursForDevices(deviceIds, fromDate, toDate);

        banner("Merging data…");
        const rows = dvirLogs.map(log => {
            const eh = asOfEngineHours(log.device.id, new Date(log.dateTime), engineHoursData);
            return {
                date: log.dateTime,
                device: log.device.name,
                plate: log.device.licensePlate,
                driver: log.driver ? log.driver.name : "",
                isSafe: log.isSafe,
                defects: log.defects?.length || 0,
                odo: log.odometer ? log.odometer.toFixed(1) : "",
                address: log.address?.formattedAddress || "",
                engineHours: eh != null ? eh.toFixed(2) : ""
            };
        });

        renderTable(rows);
        banner(`Loaded ${rows.length} rows.`, "success");
    }

    async function getAll(typeName, search) {
        const results = [];
        let fromVersion = null;
        while (true) {
            const page = await api.call("GetFeed", { typeName, search, fromVersion });
            if (!page.data.length) break;
            results.push(...page.data);
            fromVersion = page.toVersion;
        }
        return results;
    }

    async function fetchEngineHoursForDevices(deviceIds, fromDate, toDate) {
        async function batchFetch(diagId, ids) {
            const calls = ids.map(id => ({
                method: "GetFeed",
                params: {
                    typeName: "StatusData",
                    search: {
                        deviceSearch: { id },
                        diagnosticSearch: { id: diagId },
                        fromDate: fromDate.toISOString(),
                        toDate: toDate.toISOString()
                    },
                    fromVersion: null
                }
            }));
            const results = await api.call("ExecuteMultiCall", { calls });
            return results.map((r, i) =>
                (r?.data || []).map(eh => ({
                    deviceId: ids[i],
                    dateTime: new Date(eh.dateTime),
                    value: eh.data?.value
                }))
            ).flat();
        }

        // Try primary diagnostic
        let data = await batchFetch(ENGINE_DIAG_PRIMARY, deviceIds);

        // Devices with no data → retry with fallback
        const missingIds = deviceIds.filter(id => !data.some(d => d.deviceId === id));
        if (missingIds.length) {
            const fallbackData = await batchFetch(ENGINE_DIAG_FALLBACK, missingIds);
            data = data.concat(fallbackData);
        }

        // Sort
        return data.sort((a, b) =>
            a.deviceId.localeCompare(b.deviceId) || a.dateTime - b.dateTime
        );
    }

    function asOfEngineHours(deviceId, date, data) {
        const rows = data.filter(r => r.deviceId === deviceId);
        let last = null;
        for (const r of rows) {
            if (r.dateTime <= date) last = r.value;
            else break;
        }
        return last;
    }

    function renderTable(rows) {
        const tbody = $("results").querySelector("tbody");
        tbody.innerHTML = rows.map(r => `
            <tr>
                <td>${r.date}</td>
                <td>${r.device}</td>
                <td>${r.plate}</td>
                <td>${r.driver}</td>
                <td>${r.isSafe}</td>
                <td>${r.defects}</td>
                <td>${r.odo}</td>
                <td>${r.address}</td>
                <td>${r.engineHours}</td>
            </tr>
        `).join("");
    }
})();
