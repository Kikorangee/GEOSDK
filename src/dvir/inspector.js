/* global geotab */
// Inspector DVIR — Drive Add-In core
// This add-in calls MyGeotab APIs directly to create DVIR logs without touching driver-vehicle assignment.

(function () {
  const STORAGE_KEY = "inspector-dvir-settings-v1";

  function loadSettings() {
    try {
      const local = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
      return Object.assign({
        reminderEnabled: true,
        reminderMinutes: 5,
        heavyEquipmentGroupId: "",
        applyHeavyOnly: true,
        webhookUrl: "",
        severityEmailThreshold: "minor"
      }, local);
    } catch (e) { return {}; }
  }

  function saveSettings(s) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  }

  async function fetchConfig() {
    try {
      const res = await fetch("config.json", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        const s = loadSettings();
        const merged = Object.assign({}, data, s); // local overrides config.json
        saveSettings(merged);
        return merged;
      }
    } catch (e) {}
    return loadSettings();
  }

  function notify(title, message) {
    if (geotab && geotab.mobile && typeof geotab.mobile.notify === "function") {
      geotab.mobile.notify(title, message);
    } else {
      alert(`${title}\n\n${message}`);
    }
  }

  function el(id){ return document.getElementById(id); }

  function setStatus(msg) {
    el("status").textContent = msg || "";
  }

  function showSettingsModal(show) {
    el("settingsModal").classList.toggle("hidden", !show);
  }

  function assetRowHtml(d){
    const name = d.name || d.serialNumber || d.id;
    return `<label class="asset"><input type="radio" name="asset" value="${d.id}"><span>${name}</span></label>`;
  }

  function selectedAssetId() {
    const r = document.querySelector('input[name="asset"]:checked');
    return r ? r.value : null;
  }

  function collectDefects() {
    // Simple example: any unchecked box becomes a defect
    const checks = Array.from(document.querySelectorAll('#checklist input[type="checkbox"]'));
    const list = [];
    checks.forEach(ch => {
      const key = ch.getAttribute("data-defect");
      if (!ch.checked) {
        list.push({ key, severity: "minor", note: "" });
      }
    });
    const notes = el("notes").value.trim();
    if (notes) list.push({ key: "notes", severity: "minor", note: notes });
    return list;
  }

  async function postWebhook(url, payload){
    if (!url) return;
    try {
      await fetch(url, { method: "POST", headers:{ "Content-Type":"application/json" }, body: JSON.stringify(payload) });
    } catch (e) {
      console.warn("Webhook failed:", e);
    }
  }

  // Geotab Drive Add-In registration
  geotab.addin.inspectorDVIR = function (api, state) {
    let settings = loadSettings();
    let groups = [], zones = [], devices = [];
    let fromVersion = ""; // for StatusData feed

    async function initialize(api_, state_, done) {
      try {
        settings = await fetchConfig();
        wireUi();
        await loadGroupsAndZones();
        await loadDevices();
        if (settings.reminderEnabled) startIgnitionFeed();
        done();
      } catch (e) {
        console.error(e);
        setStatus("Initialization error — check console/logs.");
        done(e);
      }
    }

    function focus(api_, state_) {
      // called when the add-in becomes visible
    }
    function blur(api_, state_) {
      // called when hidden
    }

    async function loadGroupsAndZones(){
      groups = await api.call("Get", { typeName: "Group", resultsLimit: 10000 });
      zones  = await api.call("Get", { typeName: "Zone",  resultsLimit: 10000 });

      // populate selects
      const gsel = el("groupSelect");
      gsel.innerHTML = `<option value="">All groups</option>` + groups.map(g => `<option value="${g.id}">${g.name}</option>`).join("");
      const zsel = el("zoneSelect");
      zsel.innerHTML = `<option value="">(none)</option>` + zones.map(z => `<option value="${z.id}">${z.name}</option>`).join("");

      if (settings.heavyEquipmentGroupId) {
        gsel.value = settings.heavyEquipmentGroupId;
      }
    }

    async function loadDevices(query) {
      const groupId = el("groupSelect").value || null;
      const search = {};
      if (query && query.trim()) search.name = query.trim();
      if (groupId) search.groups = [{ id: groupId }];

      devices = await api.call("Get", { typeName: "Device", search, resultsLimit: 200 });
      renderDeviceList();
    }

    function renderDeviceList(){
      el("assetList").innerHTML = devices.map(assetRowHtml).join("");
    }

    async function submitDVIR(){
      try {
        const deviceId = selectedAssetId();
        if (!deviceId) { notify("Pick an asset", "Please select an asset to inspect."); return; }

        const odo = Number(el("odo").value) || null;
        const hubo = Number(el("hubo").value) || null;
        const zoneId = el("zoneSelect").value || "";
        const zoneName = zoneId ? (zones.find(z => z.id === zoneId)?.name || "") : "";
        const logType = el("logType").value || "PreTrip";
        const defects = collectDefects();
        const severityThreshold = el("severityThreshold").value || "none";

        const remarks = `Inspector DVIR | Zone: ${zoneName || "-"} | Hubo: ${hubo ?? ""} | via Add-In v1.0`;

        setStatus("Submitting DVIR…");
        // 1) Add DVIRLog
        const dvirLog = await api.call("Add", {
          typeName: "DVIRLog",
          entity: {
            device: { id: deviceId },
            dateTime: new Date().toISOString(),
            remarks: remarks,
            // logType: logType // uncomment when your DB supports it consistently
          }
        });

        // 2) Add defects (unchecked items become defects)
        let postedDefects = [];
        for (const d of defects) {
          const res = await api.call("Add", {
            typeName: "DVIRDefect",
            entity: {
              dvirLog: { id: dvirLog.id },
              // map your custom defect catalog here — using key as a label/remark in this starter
              defectRemarks: [{ remark: d.note || d.key }]
            }
          });
          postedDefects.push(res);
        }

        // 3) Webhook/email on threshold
        const hasMinor = postedDefects.length > 0;
        const hasMajor = postedDefects.some(x => true); // placeholder if you add severity
        const shouldAlert = (severityThreshold === "minor" && hasMinor) || (severityThreshold === "major" && hasMajor);

        if (shouldAlert && settings.webhookUrl) {
          await postWebhook(settings.webhookUrl, {
            dvirLogId: dvirLog.id,
            deviceId,
            zone: zoneName,
            hubodometer: hubo,
            defects: postedDefects.map(() => ({ note: "See DVIR defect record" })),
            createdAt: new Date().toISOString()
          });
        }

        setStatus("DVIR submitted ✔");
        notify("DVIR submitted", "Your inspection has been recorded.");
      } catch (e) {
        console.error(e);
        setStatus("Submit failed — check console/logs.");
        notify("Submit failed", (e && e.message) || "See console.");
      }
    }

    async function startIgnitionFeed(){
      async function tick(){
        try {
          const feed = await api.call("GetFeed", { typeName: "StatusData", fromVersion, resultsLimit: 1000 });
          fromVersion = feed.toVersion;
          const now = Date.now();

          for (const s of feed.data) {
            const isIgn = s.status && s.status.type && s.status.type.name === "Ignition";
            if (!isIgn) continue;
            const deviceId = s.device.id;
            const isOn = Number(s.data) === 1;

            // limit scope to heavy equipment if configured
            if (settings.applyHeavyOnly && settings.heavyEquipmentGroupId) {
              const d = devices.find(x => x.id === deviceId);
              const inGroup = !!(d && (d.groups || []).some(g => g.id === settings.heavyEquipmentGroupId));
              if (!inGroup) continue;
            }

            if (isOn) {
              // schedule reminder in N minutes if no DVIR exists
              const ms = Math.max(1, Number(settings.reminderMinutes) || 5) * 60000;
              setTimeout(async () => {
                try {
                  const sinceIso = new Date(Date.now() - ms).toISOString();
                  const logs = await api.call("Get", {
                    typeName: "DVIRLog",
                    search: { deviceSearch: { id: deviceId }, fromDate: sinceIso },
                    resultsLimit: 5
                  });
                  if (!logs.length) {
                    notify("DVIR reminder", "No inspection logged in the last few minutes — tap Inspector DVIR.");
                  }
                } catch (err) { console.warn("Reminder check failed", err); }
              }, ms);
            }
          }
        } catch (e) {
          console.warn("GetFeed(StatusData) failed", e);
        }
        setTimeout(tick, 15000);
      }
      tick();
    }

    function wireUi(){
      el("assetSearch").addEventListener("input", (e) => loadDevices(e.target.value));
      el("groupSelect").addEventListener("change", () => loadDevices());
      el("submitBtn").addEventListener("click", submitDVIR);
      el("settingsBtn").addEventListener("click", () => {
        // load current settings into modal
        el("reminderEnabled").checked = !!settings.reminderEnabled;
        el("reminderMinutes").value = Number(settings.reminderMinutes || 5);
        el("heavyOnly").checked = !!settings.applyHeavyOnly;
        el("webhookUrl").value = settings.webhookUrl || "";
        showSettingsModal(true);
      });
      el("saveSettings").addEventListener("click", () => {
        settings.reminderEnabled = !!el("reminderEnabled").checked;
        settings.reminderMinutes = Math.max(1, Number(el("reminderMinutes").value || 5));
        settings.applyHeavyOnly = !!el("heavyOnly").checked;
        settings.webhookUrl = el("webhookUrl").value.trim();
        saveSettings(settings);
        showSettingsModal(false);
        notify("Settings saved", "Your preferences are stored on this device.");
      });
      el("closeSettings").addEventListener("click", () => showSettingsModal(false));
    }

    return { initialize, focus, blur };
  };
})();
