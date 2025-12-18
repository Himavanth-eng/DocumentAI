// ✅ BACKEND BASE URL
const API_BASE = "https://documentai-backend.onrender.com";

let vendorChart = null;
let radarChart = null;

// ------------------------- LOAD TABLE -------------------------
async function loadInvoices() {
    const res = await fetch(API_BASE + "/invoices");
    const list = await res.json();

    const table = document.getElementById("invoiceTable");
    table.innerHTML = "";

    list.forEach((inv, i) => {
        table.innerHTML += `
        <tr>
            <td>${inv.invoiceNumber}</td>
            <td>${inv.vendorName}</td>
            <td>₹${inv.amount}</td>
            <td>${inv.DRS}</td>
            <td>
              <button class="btn-secondary" onclick='showDetails(${JSON.stringify(inv)})'>
                View
              </button>
            </td>
            <td>
              <button class="btn-primary" onclick='deleteInvoice(${i})'>
                Delete
              </button>
            </td>
        </tr>`;
    });
}

loadInvoices();

// ------------------------- SUBMIT -------------------------
async function submitInvoice(e) {
    e.preventDefault(); // 🔥 VERY IMPORTANT

    const data = {
        invoiceNumber: invoiceNumber.value,
        vendorName: vendorName.value,
        amount: Number(amount.value),
        description: description.value
    };

    const res = await fetch(API_BASE + "/process-invoice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data)
    });

    const result = await res.json();

    loadInvoices();
    showDetails(result);
}

// ------------------------- DELETE (OPTIONAL – NOT IMPLEMENTED IN BACKEND)
async function deleteInvoice(index) {
    alert("Delete API not implemented in backend");
}

// ------------------------- DETAILS MODAL -------------------------
async function showDetails(inv) {
    document.getElementById("detailsModal").style.display = "block";

    detailsBox.innerHTML = `
        <h2>${inv.invoiceNumber} — ${inv.vendorName}</h2>
        <p><b>Amount:</b> ₹${inv.amount}</p>

        <h3>🔍 AI Scores</h3>
        <p>Anomaly: ${inv.anomalyScore}</p>
        <p>Tone: ${inv.toneScore}</p>
        <p>Fishiness: ${inv.fishinessScore}</p>
        <p>Transparency: ${inv.transparencyIndex}</p>
        <p>Clarity: ${inv.clarityScore}</p>
        <p>Plagiarism: ${inv.plagiarismScore}%</p>
        <p><b>DRS:</b> ${inv.DRS}/100</p>

        <h3>🧠 Storyline</h3>
        <p>${inv.storyline}</p>

        <h3>🔐 PII Detected</h3>
        <p>${inv.pii.length ? inv.pii.join(", ") : "None"}</p>
    `;

    // Vendor Trend
    const res = await fetch(API_BASE + "/invoices");
    const all = await res.json();

    const vendorInvoices = all.filter(x => x.vendorName === inv.vendorName);

    if (vendorChart) vendorChart.destroy();
    vendorChart = new Chart(vendorTrend, {
        type: "line",
        data: {
            labels: vendorInvoices.map(x => x.invoiceNumber),
            datasets: [{
                label: "Vendor Spending",
                data: vendorInvoices.map(x => x.amount),
                borderColor: "cyan",
                backgroundColor: "rgba(0,255,255,0.3)",
                fill: true
            }]
        }
    });

    if (radarChart) radarChart.destroy();
    radarChart = new Chart(riskRadar, {
        type: "radar",
        data: {
            labels: ["Anomaly","Tone","Fishiness","Transparency","Clarity","Plagiarism"],
            datasets: [{
                label: "Risk Profile",
                data: [
                    inv.anomalyScore,
                    inv.toneScore,
                    inv.fishinessScore,
                    inv.transparencyIndex,
                    inv.clarityScore,
                    inv.plagiarismScore
                ],
                borderColor: "cyan",
                backgroundColor: "rgba(0,255,255,0.3)"
            }]
        }
    });
}

function closeModal() {
    detailsModal.style.display = "none";
}

// ------------------------- OCR -------------------------
async function extractTextFromImage() {
    const file = ocrFile.files[0];
    if (!file) return alert("Upload an image");

    const formData = new FormData();
    formData.append("image", file);

    const res = await fetch(API_BASE + "/ocr", {
        method: "POST",
        body: formData
    });

    const result = await res.json();
    description.value = result.text || "";
}



















