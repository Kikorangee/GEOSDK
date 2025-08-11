(function () {
    const $ = id => document.getElementById(id);
    const banner = (msg, cls = "info") => {
        const b = $("banner");
        b.className = `alert alert-${cls}`;
        b.textContent = msg;
        b.classList.remove("d-none");
    };
    const clearBanner = () => $("banner").classList.add("d-none");

    let api;

    $("connect").onclick = async () => {
        const server = $("server").value.trim();
        const database = $("database").value.trim();
        const username = $("username").value.trim();
        const password = $("password").value.trim();
        clearBanner();
        banner("Connecting...", "info");
        try {
            api = new GeotabApi(server, database, username, password);
            await new Promise((resolve, reject) => {
                api.authenticate((result) => {
                    if (result) resolve();
                    else reject("Auth failed");
                }, reject);
            });
            banner("Connected. Loading inspections...", "success");
            loadInspections();
        } catch (err) {
            banner("Error: " + err, "danger");
        }
    };

    async function loadInspections() {
        try {
            // Get DVIR logs
            const dvirLogs = await api.call("Get", {
                typeName: "DVIRLog",
                resultsLimit: 50
            });

            if (!dvirLogs.length) {
                banner("No inspections found", "warning");
                return;
            }

            // Map device IDs
            const deviceIds = [...new Set(dvirLogs.map(d => d.device.id))];

            // Get engine hours for each device (latest reading)
            const engineHoursCalls = deviceIds.map(id => ({
                method: "Get",
                params: {
                    typeName: "StatusData",
                    search: {
                        diagnosticSearch: { id: "DiagnosticEngineHoursId" },
                        deviceSearch: { id },
                        fromDate: new Date(new Date().setDate(new Date().getDate() - 1)).toISOString()
                    },
                    resultsLimit: 1
                }
            }));

            const engineHoursResults = await api.call("ExecuteMultiCall", { calls: engineHoursCalls });
            const engineHoursMap = {};
            engineHoursResults.forEach((res, i) => {
                engineHoursMap[deviceIds[i]] = res[0] ? res[0].data : null;
            });

            // Populate table
            const tbody = $("results").querySelector("tbody");
            tbody.innerHTML = "";
            dvirLogs.forEach(log => {
                const row = document.createElement("tr");
                row.innerHTML = `
                    <td>${new Date(log.dateTime).toLocaleString()}</td>
                    <td>${log.device.name}</td>
                    <td>${log.device.licensePlate || ""}</td>
                    <td>${log.driver ? log.driver.name : ""}</td>
                    <td>${log.isSafe}</td>
                    <td>${(log.defects || []).map(d => d.name).join(", ")}</td>
                    <td>${log.odometer || ""}</td>
                    <td>${log.address || ""}</td>
                    <td>${engineHoursMap[log.device.id] || ""}</td>
                `;
                tbody.appendChild(row);
            });
        } catch (err) {
            banner("Error loading inspections: " + err, "danger");
        }
    }
})();
