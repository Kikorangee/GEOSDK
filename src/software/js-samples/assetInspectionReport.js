/**
 * Asset Inspection + Engine Hours Report
 * Integrates with your existing Geotab SDK setup
 * Place this file in your GEOSDK/src/software/js-samples/ directory
 */

(function() {
    'use strict';

    // Configuration - Update these with your MyGeotab details
    const CONFIG = {
        server: 'my.geotab.com', // Change if using different server (e.g., my5.geotab.com)
        database: '', // Your database name
        userName: '', // Your username
        password: ''  // Your password
    };

    let api = null;
    let sessionId = null;

    /**
     * Initialize the report tool
     */
    function initialize() {
        console.log('Initializing Asset Inspection + Engine Hours Report Tool');
        
        // Create UI
        createReportInterface();
        
        // Set default date range (last 7 days)
        const today = new Date();
        const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
        
        document.getElementById('fromDate').value = formatDateForInput(weekAgo);
        document.getElementById('toDate').value = formatDateForInput(today);
    }

    /**
     * Create the user interface for the report tool
     */
    function createReportInterface() {
        const container = document.createElement('div');
        container.innerHTML = `
            <div style="max-width: 1000px; margin: 20px auto; padding: 20px; font-family: Arial, sans-serif;">
                <h1 style="color: #2c3e50; text-align: center; margin-bottom: 30px;">
                    🚛 Asset Inspection + Engine Hours Report
                </h1>
                
                <div style="background: #f8f9fa; padding: 25px; border-radius: 8px; margin-bottom: 20px; border-left: 4px solid #3498db;">
                    <h3 style="margin-bottom: 15px; color: #2c3e50;">📋 Connection Settings</h3>
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-bottom: 15px;">
                        <div>
                            <label style="display: block; margin-bottom: 5px; font-weight: 600;">Server:</label>
                            <input type="text" id="server" value="${CONFIG.server}" style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px;">
                        </div>
                        <div>
                            <label style="display: block; margin-bottom: 5px; font-weight: 600;">Database:</label>
                            <input type="text" id="database" value="${CONFIG.database}" placeholder="Your database name" style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px;">
                        </div>
                        <div>
                            <label style="display: block; margin-bottom: 5px; font-weight: 600;">Username:</label>
                            <input type="text" id="username" value="${CONFIG.userName}" placeholder="your.email@company.com" style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px;">
                        </div>
                        <div>
                            <label style="display: block; margin-bottom: 5px; font-weight: 600;">Password:</label>
                            <input type="password" id="password" value="${CONFIG.password}" placeholder="Your password" style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px;">
                        </div>
                    </div>
                    <button onclick="window.AssetInspectionReport.testConnection()" style="background: #3498db; color: white; border: none; padding: 10px 20px; border-radius: 4px; cursor: pointer; width: 100%;">
                        🔗 Test Connection
                    </button>
                    <div id="connectionStatus" style="margin-top: 10px; padding: 10px; border-radius: 4px; display: none;"></div>
                </div>

                <div style="background: #f8f9fa; padding: 25px; border-radius: 8px; margin-bottom: 20px; border-left: 4px solid #27ae60;">
                    <h3 style="margin-bottom: 15px; color: #2c3e50;">📅 Report Settings</h3>
                    <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 15px; margin-bottom: 15px;">
                        <div>
                            <label style="display: block; margin-bottom: 5px; font-weight: 600;">From Date:</label>
                            <input type="date" id="fromDate" style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px;">
                        </div>
                        <div>
                            <label style="display: block; margin-bottom: 5px; font-weight: 600;">To Date:</label>
                            <input type="date" id="toDate" style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px;">
                        </div>
                        <div>
                            <label style="display: block; margin-bottom: 5px; font-weight: 600;">Report Type:</label>
                            <select id="reportType" style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px;">
                                <option value="all">All Inspections + Engine Hours</option>
                                <option value="defects">Only Inspections with Defects</option>
                                <option value="recent">Most Recent per Vehicle</option>
                            </select>
                        </div>
                    </div>
                    <button onclick="window.AssetInspectionReport.generateReport()" id="generateBtn" disabled style="background: #27ae60; color: white; border: none; padding: 10px 20px; border-radius: 4px; cursor: pointer; width: 100%;">
                        📊 Generate Report
                    </button>
                    <div id="reportStatus" style="margin-top: 10px; padding: 10px; border-radius: 4px; display: none;"></div>
                </div>

                <div id="loadingDiv" style="text-align: center; padding: 20px; display: none;">
                    <div style="border: 4px solid #f3f3f3; border-top: 4px solid #3498db; border-radius: 50%; width: 40px; height: 40px; animation: spin 1s linear infinite; margin: 0 auto 15px;"></div>
                    <p>Connecting to MyGeotab and retrieving data...</p>
                    <p><small>This may take 30-60 seconds for large fleets</small></p>
                </div>

                <div id="resultsDiv" style="display: none; margin-top: 20px;">
                    <h3 style="color: #2c3e50;">📋 Report Results</h3>
                    <div id="resultsTable" style="overflow-x: auto; margin: 15px 0;"></div>
                    <div style="text-align: center; margin-top: 15px;">
                        <button onclick="window.AssetInspectionReport.downloadCSV()" style="background: #e74c3c; color: white; border: none; padding: 10px 20px; border-radius: 4px; cursor: pointer; margin: 0 10px;">
                            ⬇️ Download CSV
                        </button>
                        <button onclick="window.AssetInspectionReport.downloadExcel()" style="background: #f39c12; color: white; border: none; padding: 10px 20px; border-radius: 4px; cursor: pointer; margin: 0 10px;">
                            📊 Download Excel
                        </button>
                    </div>
                </div>
            </div>

            <style>
                @keyframes spin {
                    0% { transform: rotate(0deg); }
                    100% { transform: rotate(360deg); }
                }
                
                table {
                    width: 100%;
                    border-collapse: collapse;
                    background: white;
                    border-radius: 8px;
                    overflow: hidden;
                    box-shadow: 0 4px 15px rgba(0,0,0,0.1);
                }
                
                th, td {
                    padding: 12px;
                    text-align: left;
                    border-bottom: 1px solid #e1e8ed;
                }
                
                th {
                    background: #3498db;
                    color: white;
                    font-weight: 600;
                }
                
                tr:hover {
                    background: #f8f9fa;
                }
                
                button:disabled {
                    background: #bdc3c7 !important;
                    cursor: not-allowed !important;
                }
            </style>
        `;
        
        document.body.appendChild(container);
    }

    /**
     * Test connection to MyGeotab
     */
    async function testConnection() {
        const server = document.getElementById('server').value;
        const database = document.getElementById('database').value;
        const username = document.getElementById('username').value;
        const password = document.getElementById('password').value;

        if (!server || !database || !username || !password) {
            showStatus('connectionStatus', '❌ Please fill in all connection fields', 'error');
            return;
        }

        showStatus('connectionStatus', '🔄 Testing connection...', 'info');

        try {
            // Use the Geotab API from your SDK
            if (typeof GeotabApi !== 'undefined') {
                api = new GeotabApi({
                    credentials: {
                        userName: username,
                        password: password,
                        database: database
                    },
                    server: server
                });
            } else {
                // Fallback to manual API calls
                api = {
                    server: server,
                    database: database,
                    credentials: null
                };
            }

            const authResult = await callAPI('Authenticate', {
                userName: username,
                password: password,
                database: database
            });

            if (authResult && authResult.credentials) {
                sessionId = authResult.credentials.sessionId;
                showStatus('connectionStatus', '✅ Connection successful! You can now generate reports.', 'success');
                document.getElementById('generateBtn').disabled = false;
            } else {
                throw new Error('Invalid authentication response');
            }

        } catch (error) {
            showStatus('connectionStatus', `❌ Connection failed: ${error.message}`, 'error');
            api = null;
            sessionId = null;
            document.getElementById('generateBtn').disabled = true;
        }
    }

    /**
     * Generate the asset inspection + engine hours report
     */
    async function generateReport() {
        if (!api || !sessionId) {
            showStatus('reportStatus', '❌ Please test connection first', 'error');
            return;
        }

        const fromDate = document.getElementById('fromDate').value + 'T00:00:00.000Z';
        const toDate = document.getElementById('toDate').value + 'T23:59:59.999Z';
        const reportType = document.getElementById('reportType').value;

        document.getElementById('loadingDiv').style.display = 'block';
        document.getElementById('resultsDiv').style.display = 'none';
        showStatus('reportStatus', '🔄 Generating report...', 'info');

        try {
            // Step 1: Get asset inspection data
            showStatus('reportStatus', '📋 Retrieving asset inspection data...', 'info');
            const dvirLogs = await callAPI('Get', {
                typeName: 'DVIRLog',
                search: {
                    fromDate: fromDate,
                    toDate: toDate
                }
            });

            if (!dvirLogs || dvirLogs.length === 0) {
                showStatus('reportStatus', '⚠️ No asset inspection data found for the selected date range', 'warning');
                document.getElementById('loadingDiv').style.display = 'none';
                return;
            }

            // Step 2: Get unique device IDs
            const deviceIds = [...new Set(dvirLogs.map(log => log.device?.id).filter(Boolean))];
            showStatus('reportStatus', `📊 Found ${dvirLogs.length} inspections for ${deviceIds.length} vehicles. Getting engine hours...`, 'info');

            // Step 3: Get engine hours for each device
            const engineHoursData = {};
            const engineHoursPromises = deviceIds.map(async deviceId => {
                try {
                    // Try ECU engine hours first
                    const ecuHours = await callAPI('Get', {
                        typeName: 'StatusData',
                        search: {
                            deviceSearch: { id: deviceId },
                            diagnosticSearch: { id: 'DiagnosticEngineHoursId' },
                            fromDate: fromDate,
                            toDate: toDate
                        },
                        resultsLimit: 1
                    });

                    if (ecuHours && ecuHours.length > 0) {
                        engineHoursData[deviceId] = {
                            hours: Math.round(ecuHours[0].data || 0),
                            source: 'ECU'
                        };
                    } else {
                        // Try GPS-calculated hours
                        const gpsHours = await callAPI('Get', {
                            typeName: 'StatusData',
                            search: {
                                deviceSearch: { id: deviceId },
                                diagnosticSearch: { id: 'DiagnosticEngineHoursAdjustmentId' },
                                fromDate: fromDate,
                                toDate: toDate
                            },
                            resultsLimit: 1
                        });

                        if (gpsHours && gpsHours.length > 0) {
                            engineHoursData[deviceId] = {
                                hours: Math.round(gpsHours[0].data || 0),
                                source: 'GPS'
                            };
                        } else {
                            engineHoursData[deviceId] = {
                                hours: 'N/A',
                                source: 'Not Available'
                            };
                        }
                    }
                } catch (error) {
                    engineHoursData[deviceId] = {
                        hours: 'Error',
                        source: 'API Error'
                    };
                }
            });

            await Promise.all(engineHoursPromises);

            // Step 4: Get device information
            showStatus('reportStatus', '🚗 Getting vehicle information...', 'info');
            const devices = await callAPI('Get', { typeName: 'Device' });
            const deviceInfo = {};
            devices.forEach(device => {
                deviceInfo[device.id] = device;
            });

            // Step 5: Get user information
            const users = await callAPI('Get', { typeName: 'User' });
            const userInfo = {};
            users.forEach(user => {
                userInfo[user.id] = user;
            });

            // Step 6: Build combined report data
            let reportData = dvirLogs.map(log => {
                const deviceId = log.device?.id;
                const driverId = log.driver?.id;
                const device = deviceInfo[deviceId] || {};
                const driver = userInfo[driverId] || {};
                const engineHours = engineHoursData[deviceId] || { hours: 'N/A', source: 'Not Available' };

                return {
                    inspectionDate: new Date(log.dateTime).toLocaleString(),
                    driverName: `${driver.firstName || ''} ${driver.lastName || ''}`.trim() || driver.name || 'Unknown',
                    vehicleName: device.name || 'Unknown',
                    licensePlate: device.licensePlate || '',
                    vin: device.vehicleIdentificationNumber || '',
                    serialNumber: device.serialNumber || '',
                    inspectionType: log.logType || '',
                    odometer: log.odometer ? Math.round(log.odometer) : 'N/A',
                    engineHours: engineHours.hours,
                    engineHoursSource: engineHours.source,
                    defectCount: log.defects ? log.defects.length : 0,
                    hasDefects: log.defects && log.defects.length > 0 ? 'Yes' : 'No',
                    isSafeToOperate: log.isSafeToOperate ? 'Yes' : 'No',
                    driverRemark: log.driverRemark || '',
                    location: log.location?.formattedAddress || ''
                };
            });

            // Filter based on report type
            if (reportType === 'defects') {
                reportData = reportData.filter(row => row.hasDefects === 'Yes');
            } else if (reportType === 'recent') {
                const vehicleLatest = {};
                reportData.forEach(row => {
                    if (!vehicleLatest[row.vehicleName] || 
                        new Date(row.inspectionDate) > new Date(vehicleLatest[row.vehicleName].inspectionDate)) {
                        vehicleLatest[row.vehicleName] = row;
                    }
                });
                reportData = Object.values(vehicleLatest);
            }

            // Display results
            window.AssetInspectionReport.reportData = reportData;
            displayResults(reportData);
            showStatus('reportStatus', `✅ Report generated successfully! Found ${reportData.length} records.`, 'success');

        } catch (error) {
            showStatus('reportStatus', `❌ Error generating report: ${error.message}`, 'error');
            console.error('Report generation error:', error);
        } finally {
            document.getElementById('loadingDiv').style.display = 'none';
        }
    }

    /**
     * Display the report results in a table
     */
    function displayResults(data) {
        if (!data || data.length === 0) {
            document.getElementById('resultsTable').innerHTML = '<p>No data found for the selected criteria.</p>';
            document.getElementById('resultsDiv').style.display = 'block';
            return;
        }

        const headers = [
            'Inspection Date', 'Driver', 'Vehicle', 'License Plate', 'Odometer', 
            'Engine Hours', 'Hours Source', 'Defects', 'Safe to Operate', 'Type', 'Location'
        ];

        let html = '<table><thead><tr>';
        headers.forEach(header => {
            html += `<th>${header}</th>`;
        });
        html += '</tr></thead><tbody>';

        data.forEach(row => {
            html += `<tr>
                <td>${row.inspectionDate}</td>
                <td>${row.driverName}</td>
                <td>${row.vehicleName}</td>
                <td>${row.licensePlate}</td>
                <td>${row.odometer}</td>
                <td>${row.engineHours}</td>
                <td>${row.engineHoursSource}</td>
                <td>${row.hasDefects}</td>
                <td>${row.isSafeToOperate}</td>
                <td>${row.inspectionType}</td>
                <td>${row.location}</td>
            </tr>`;
        });

        html += '</tbody></table>';
        document.getElementById('resultsTable').innerHTML = html;
        document.getElementById('resultsDiv').style.display = 'block';
    }

    /**
     * Download report as CSV
     */
    function downloadCSV() {
        const data = window.AssetInspectionReport.reportData;
        if (!data || data.length === 0) return;

        const headers = [
            'Inspection Date', 'Driver Name', 'Vehicle Name', 'License Plate', 'VIN', 
            'Serial Number', 'Inspection Type', 'Odometer', 'Engine Hours', 'Engine Hours Source',
            'Defect Count', 'Has Defects', 'Safe to Operate', 'Driver Remark', 'Location'
        ];

        let csv = headers.join(',') + '\n';

        data.forEach(row => {
            const csvRow = [
                `"${row.inspectionDate}"`,
                `"${row.driverName}"`,
                `"${row.vehicleName}"`,
                `"${row.licensePlate}"`,
                `"${row.vin}"`,
                `"${row.serialNumber}"`,
                `"${row.inspectionType}"`,
                row.odometer,
                row.engineHours,
                `"${row.engineHoursSource}"`,
                row.defectCount,
                `"${row.hasDefects}"`,
                `"${row.isSafeToOperate}"`,
                `"${row.driverRemark.replace(/"/g, '""')}"`,
                `"${row.location}"`
            ];
            csv += csvRow.join(',') + '\n';
        });

        downloadFile(csv, 'asset_inspection_with_engine_hours.csv', 'text/csv');
    }

    /**
     * Download report as Excel
     */
    function downloadExcel() {
        const data = window.AssetInspectionReport.reportData;
        if (!data || data.length === 0) return;

        // Create Excel-compatible tab-separated format
        const headers = [
            'Inspection Date', 'Driver Name', 'Vehicle Name', 'License Plate', 'VIN', 
            'Serial Number', 'Inspection Type', 'Odometer', 'Engine Hours', 'Engine Hours Source',
            'Defect Count', 'Has Defects', 'Safe to Operate', 'Driver Remark', 'Location'
        ];

        let excel = headers.join('\t') + '\n';

        data.forEach(row => {
            const excelRow = [
                row.inspectionDate,
                row.driverName,
                row.vehicleName,
                row.licensePlate,
                row.vin,
                row.serialNumber,
                row.inspectionType,
                row.odometer,
                row.engineHours,
                row.engineHoursSource,
                row.defectCount,
                row.hasDefects,
                row.isSafeToOperate,
                row.driverRemark.replace(/\t/g, ' '),
                row.location
            ];
            excel += excelRow.join('\t') + '\n';
        });

        downloadFile(excel, 'asset_inspection_with_engine_hours.xls', 'application/vnd.ms-excel');
    }

    /**
     * Utility functions
     */
    function callAPI(method, params = {}) {
        if (sessionId) {
            params.credentials = { sessionId: sessionId };
        }

        if (typeof api.call === 'function') {
            // Use SDK API if available
            return api.call(method, params);
        } else {
            // Fallback to manual API calls
            return fetch(`https://${api.server}/apiv1`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ method: method, params: params })
            })
            .then(response => response.json())
            .then(data => {
                if (data.error) throw new Error(data.error.message);
                return data.result;
            });
        }
    }

    function showStatus(elementId, message, type) {
        const statusEl = document.getElementById(elementId);
        statusEl.textContent = message;
        statusEl.style.display = 'block';
        statusEl.style.backgroundColor = type === 'success' ? '#d4edda' : 
                                       type === 'error' ? '#f8d7da' : 
                                       type === 'warning' ? '#fff3cd' : '#d1ecf1';
        statusEl.style.color = type === 'success' ? '#155724' : 
                              type === 'error' ? '#721c24' : 
                              type === 'warning' ? '#856404' : '#0c5460';
        statusEl.style.border = `1px solid ${type === 'success' ? '#c3e6cb' : 
                                            type === 'error' ? '#f5c6cb' : 
                                            type === 'warning' ? '#ffeaa7' : '#bee5eb'}`;
    }

    function formatDateForInput(date) {
        return date.toISOString().split('T')[0];
    }

    function downloadFile(content, filename, contentType) {
        const blob = new Blob([content], { type: contentType });
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);
    }

    // Export public functions to global scope
    window.AssetInspectionReport = {
        initialize: initialize,
        testConnection: testConnection,
        generateReport: generateReport,
        downloadCSV: downloadCSV,
        downloadExcel: downloadExcel,
        reportData: []
    };

    // Auto-initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initialize);
    } else {
        initialize();
    }

})();
