const API = `${window.location.origin}/api/patients`;

const searchInput = document.getElementById('searchInput');
const refreshBtn = document.getElementById('refreshBtn');
const patientsTableBody = document.getElementById('patientsTableBody');
const listMeta = document.getElementById('listMeta');
const detailBody = document.getElementById('detailBody');

let searchDebounceTimer = null;
let selectedPatientId = null;
let _dnRoot = null;

const SEX_LABELS = {
    MALE: 'Male',
    FEMALE: 'Female',
    INTERSEX: 'Intersex',
    UNKNOWN: 'Unknown',
};

const BLOOD_LABELS = {
    A_POS: 'A+',
    A_NEG: 'A−',
    B_POS: 'B+',
    B_NEG: 'B−',
    AB_POS: 'AB+',
    AB_NEG: 'AB−',
    O_POS: 'O+',
    O_NEG: 'O−',
    UNKNOWN: 'Unknown',
};

function labelSex(v) {
    return SEX_LABELS[v] || v || '—';
}

function labelBlood(v) {
    return BLOOD_LABELS[v] || v || '—';
}

function labelGenotype(v) {
    return v === 'UNKNOWN' ? 'Unknown' : v || '—';
}

function formatDateOnly(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
    });
}

function formatDateTime(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
}

function humanizeEnum(value) {
    if (value == null || value === '') return '—';
    return String(value)
        .split('_')
        .map((w) => w.charAt(0) + w.slice(1).toLowerCase())
        .join(' ');
}

function truncate(text, max) {
    if (text == null || text === '') return '';
    const s = String(text);
    if (s.length <= max) return s;
    return `${s.slice(0, max)}…`;
}

function ageFromDob(iso) {
    if (!iso) return null;
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return null;
    const today = new Date();
    let age = today.getFullYear() - d.getFullYear();
    const m = today.getMonth() - d.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < d.getDate())) {
        age -= 1;
    }
    return age;
}

function fullName(p) {
    return [p.firstName, p.middleName, p.lastName].filter(Boolean).join(' ');
}

function escapeHtml(s) {
    if (s == null) return '';
    const div = document.createElement('div');
    div.textContent = String(s);
    return div.innerHTML;
}

function debounce(fn, ms) {
    return (...args) => {
        clearTimeout(searchDebounceTimer);
        searchDebounceTimer = setTimeout(() => fn(...args), ms);
    };
}

function updateSelectionClasses() {
    patientsTableBody.querySelectorAll('tr[data-id]').forEach((row) => {
        const id = row.getAttribute('data-id');
        row.classList.toggle('is-selected', id === selectedPatientId);
    });
}

function setListLoading() {
    patientsTableBody.innerHTML = `
        <tr>
            <td colspan="3" class="empty-state">
                <div class="empty-state-content">
                    <p class="empty-title">Loading patients…</p>
                    <p class="empty-description">Please wait.</p>
                </div>
            </td>
        </tr>`;
    listMeta.textContent = '';
}

function setListError(message) {
    patientsTableBody.innerHTML = `
        <tr>
            <td colspan="3" class="empty-state">
                <div class="empty-state-content">
                    <p class="empty-title">Could not load patients</p>
                    <p class="empty-description">${escapeHtml(message)}</p>
                </div>
            </td>
        </tr>`;
    listMeta.textContent = '';
}

async function loadPatientList() {
    setListLoading();
    const q = searchInput.value.trim();
    const url = new URL(API);
    if (q) url.searchParams.set('q', q);

    let data;
    try {
        const res = await fetch(url.toString());
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.error || res.statusText);
        }
        data = await res.json();
    } catch (e) {
        setListError(e.message || 'Network error');
        return;
    }

    const { patients, total, take, skip } = data;
    const start = total === 0 ? 0 : skip + 1;
    const end = Math.min(skip + patients.length, total);
    listMeta.textContent = total === 0 ? 'No matches' : `Showing ${start}–${end} of ${total}`;

    if (!patients.length) {
        patientsTableBody.innerHTML = `
            <tr>
                <td colspan="3" class="empty-state">
                    <div class="empty-state-content">
                        <p class="empty-title">No patients found</p>
                        <p class="empty-description">Try a different search or clear the filter.</p>
                    </div>
                </td>
            </tr>`;
        return;
    }

    patientsTableBody.innerHTML = patients
        .map((p) => {
            const age = ageFromDob(p.dateOfBirth);
            const dobLine = `${formatDateOnly(p.dateOfBirth)}${age != null ? ` (${age} yrs)` : ''}`;
            const deceasedTag = p.deceased ? ' <span class="badge badge-muted">Deceased</span>' : '';
            return `
                <tr class="table-row-clickable" data-id="${escapeHtml(p.id)}" role="button" tabindex="0">
                    <td class="font-mono">${escapeHtml(p.medicalRecordNumber)}</td>
                    <td>${escapeHtml(fullName(p))}${deceasedTag}</td>
                    <td>${escapeHtml(dobLine)}</td>
                </tr>`;
        })
        .join('');

    updateSelectionClasses();

    patientsTableBody.querySelectorAll('tr[data-id]').forEach((row) => {
        row.addEventListener('click', () => selectPatient(row.getAttribute('data-id')));
        row.addEventListener('keydown', (ev) => {
            if (ev.key === 'Enter' || ev.key === ' ') {
                ev.preventDefault();
                selectPatient(row.getAttribute('data-id'));
            }
        });
    });
}

function renderDetailPlaceholder(title, desc) {
    detailBody.innerHTML = `
        <div class="empty-state-content patients-detail-placeholder">
            <p class="empty-title">${escapeHtml(title)}</p>
            <p class="empty-description">${escapeHtml(desc)}</p>
        </div>`;
}

function renderDetailLoading() {
    detailBody.innerHTML = `
        <div class="empty-state-content patients-detail-placeholder">
            <p class="empty-title">Loading…</p>
            <p class="empty-description">Fetching patient record.</p>
        </div>`;
}

function dlRow(label, valueHtml) {
    return `<div class="patient-dl-row"><dt>${escapeHtml(label)}</dt><dd>${valueHtml}</dd></div>`;
}

function emptyTabMessage(title, body) {
    return `<div class="patient-tab-empty"><p class="empty-title">${escapeHtml(title)}</p><p class="empty-description">${escapeHtml(body)}</p></div>`;
}

function renderEncountersPanel(encounters) {
    if (!encounters || !encounters.length) {
        return emptyTabMessage('No encounters', 'There are no encounters on file for this patient.');
    }
    return `<div class="table-container patient-tab-table-wrap">
        <table class="table table-patient-sub">
            <thead><tr><th>When</th><th>Type</th><th>Chief complaint</th><th>Disposition</th></tr></thead>
            <tbody>${encounters
                .map(
                    (e) => `
                <tr>
                    <td>${escapeHtml(formatDateTime(e.encounterDateTime))}</td>
                    <td>${escapeHtml(humanizeEnum(e.encounterType))}</td>
                    <td>
                        <span title="${escapeHtml(e.chiefComplaint || '')}">${e.chiefComplaint ? escapeHtml(truncate(e.chiefComplaint, 80)) : '—'}</span>
                        ${e.clinicalSummary ? `<div class="text-muted patient-subline" title="${escapeHtml(e.clinicalSummary)}">${escapeHtml(truncate(e.clinicalSummary, 100))}</div>` : ''}
                    </td>
                    <td>${escapeHtml(humanizeEnum(e.disposition))}</td>
                </tr>`
                )
                .join('')}
            </tbody>
        </table>
    </div>`;
}

function renderAllergiesPanel(rows) {
    if (!rows || !rows.length) {
        return emptyTabMessage('No allergies', 'No allergy records for this patient.');
    }
    return `<div class="table-container patient-tab-table-wrap">
        <table class="table table-patient-sub">
            <thead><tr><th>Allergen</th><th>Reaction</th><th>Severity</th><th>Status</th><th>Onset</th></tr></thead>
            <tbody>${rows
                .map(
                    (r) => `
                <tr>
                    <td>${escapeHtml(r.allergen)}</td>
                    <td>${escapeHtml(truncate(r.reaction, 120))}</td>
                    <td>${escapeHtml(humanizeEnum(r.severity))}</td>
                    <td>${escapeHtml(humanizeEnum(r.status))}</td>
                    <td>${escapeHtml(formatDateOnly(r.onsetDate))}</td>
                </tr>`
                )
                .join('')}
            </tbody>
        </table>
    </div>`;
}

function renderMedicalHistoryPanel(rows) {
    if (!rows || !rows.length) {
        return emptyTabMessage('No medical history', 'No past conditions on file.');
    }
    return `<div class="table-container patient-tab-table-wrap">
        <table class="table table-patient-sub">
            <thead><tr><th>Condition</th><th>Code</th><th>Diagnosed</th><th>Resolved</th><th>Chronicity</th><th>Family hx</th></tr></thead>
            <tbody>${rows
                .map(
                    (r) => `
                <tr>
                    <td>${escapeHtml(r.conditionName)}</td>
                    <td class="font-mono">${escapeHtml(r.conditionCode || '—')}</td>
                    <td>${escapeHtml(formatDateOnly(r.diagnosisDate))}</td>
                    <td>${escapeHtml(formatDateOnly(r.resolutionDate))}</td>
                    <td>${escapeHtml(humanizeEnum(r.chronicity))}</td>
                    <td>${r.familyHistory ? 'Yes' : 'No'}</td>
                </tr>`
                )
                .join('')}
            </tbody>
        </table>
    </div>`;
}

function renderCarePlansPanel(rows) {
    if (!rows || !rows.length) {
        return emptyTabMessage('No care plans', 'No care plans linked to this patient.');
    }
    return `<div class="table-container patient-tab-table-wrap">
        <table class="table table-patient-sub">
            <thead><tr><th>Status</th><th>Review</th><th>Goals</th><th>Interventions</th></tr></thead>
            <tbody>${rows
                .map((r) => {
                    return `
                <tr>
                    <td>${escapeHtml(humanizeEnum(r.status))}</td>
                    <td>${escapeHtml(formatDateOnly(r.reviewDate))}</td>
                    <td>${escapeHtml(truncate((r.goals || []).join('; '), 140))}</td>
                    <td>${escapeHtml(truncate((r.interventions || []).join('; '), 140))}</td>
                </tr>`;
                })
                .join('')}
            </tbody>
        </table>
    </div>`;
}

function renderImmunizationsPanel(rows) {
    if (!rows || !rows.length) {
        return emptyTabMessage('No immunizations', 'No vaccine administrations recorded.');
    }
    return `<div class="table-container patient-tab-table-wrap">
        <table class="table table-patient-sub">
            <thead><tr><th>Vaccine</th><th>Code</th><th>Date</th><th>Dose</th><th>Reaction</th></tr></thead>
            <tbody>${rows
                .map(
                    (r) => `
                <tr>
                    <td>${escapeHtml(r.vaccineName)}</td>
                    <td class="font-mono">${escapeHtml(r.vaccineCode || '—')}</td>
                    <td>${escapeHtml(formatDateOnly(r.administrationDate))}</td>
                    <td>${r.doseNumber != null ? escapeHtml(String(r.doseNumber)) : '—'}</td>
                    <td>${escapeHtml(r.adverseReaction ? truncate(r.adverseReaction, 80) : '—')}</td>
                </tr>`
                )
                .join('')}
            </tbody>
        </table>
    </div>`;
}

function renderObservationsPanel(rows) {
    if (!rows || !rows.length) {
        return emptyTabMessage('No observations', 'No observations (labs, vitals, etc.) on file.');
    }
    return `<div class="table-container patient-tab-table-wrap">
        <table class="table table-patient-sub">
            <thead><tr><th>Observed</th><th>Type</th><th>Value</th><th>Interpretation</th></tr></thead>
            <tbody>${rows
                .map(
                    (r) => `
                <tr>
                    <td>${escapeHtml(formatDateTime(r.observedAt))}</td>
                    <td>${escapeHtml(r.observationType)}${r.observationCode ? ` <span class="text-muted font-mono">${escapeHtml(r.observationCode)}</span>` : ''}</td>
                    <td>${escapeHtml(r.value)}${r.unit ? ` <span class="text-muted">${escapeHtml(r.unit)}</span>` : ''}</td>
                    <td>${escapeHtml(r.interpretation || '—')}</td>
                </tr>`
                )
                .join('')}
            </tbody>
        </table>
    </div>`;
}

function renderDoctorNotesPanel(notes, patientId) {
    const addBtn = `<div style="margin-bottom:0.75rem">
        <button class="btn btn-primary btn-sm" id="addDoctorNoteBtn" data-patient="${escapeHtml(patientId)}">+ Add note</button>
    </div>`;
    if (!notes || !notes.length) {
        return addBtn + emptyTabMessage("No doctor's notes", 'No notes have been saved for this patient yet.');
    }
    const rows = notes.map((n) => `
        <tr>
            <td>${escapeHtml(formatDateTime(n.createdAt))}</td>
            <td class="font-mono text-muted" title="${escapeHtml(n.encounterId || '')}">${escapeHtml(truncate(n.encounterId || '—', 14))}</td>
            <td>${escapeHtml(humanizeEnum(n.noteType))}</td>
            <td><span title="${escapeHtml(n.noteText || '')}">${escapeHtml(truncate(n.noteText || '', 120))}</span></td>
        </tr>`).join('');
    return addBtn + `<div class="table-container patient-tab-table-wrap">
        <table class="table table-patient-sub">
            <thead><tr><th>Date</th><th>Encounter</th><th>Type</th><th>Note</th></tr></thead>
            <tbody>${rows}</tbody>
        </table>
    </div>`;
}

async function loadDoctorNotes(patientId, root) {
    const panel = root.querySelector('[data-tabpanel="notes"]');
    if (!panel) return;
    panel.innerHTML = '<p class="text-muted" style="padding:1rem">Loading notes…</p>';
    try {
        const res = await fetch(`${API}/${encodeURIComponent(patientId)}/notes`);
        if (!res.ok) throw new Error(res.statusText);
        const notes = await res.json();
        panel.innerHTML = renderDoctorNotesPanel(notes, patientId);
        wireAddNoteButton(panel, patientId, root);
    } catch (e) {
        panel.innerHTML = `<p class="text-muted" style="padding:1rem">Failed to load notes: ${escapeHtml(e.message)}</p>`;
    }
}

function wireAddNoteButton(panel, patientId, root) {
    const btn = panel.querySelector('#addDoctorNoteBtn');
    if (!btn) return;
    btn.addEventListener('click', () => openDoctorNoteModal(patientId, root));
}

function openDoctorNoteModal(patientId, root) {
    const patient = window._currentPatient;
    const select = document.getElementById('dnEncounterSelect');
    select.innerHTML = (patient?.encounters || []).map((e) =>
        `<option value="${escapeHtml(e.id)}">${escapeHtml(formatDateTime(e.encounterDateTime))} — ${escapeHtml(truncate(e.chiefComplaint || '', 50))}</option>`
    ).join('');
    document.getElementById('dnNoteText').value = '';
    document.getElementById('dnNoteType').value = 'DOCTORS_NOTE';
    document.getElementById('dnErrorSection').style.display = 'none';
    const modal = document.getElementById('doctorNoteModal');
    modal.dataset.patientId = patientId;
    modal.style.display = 'flex';
    _dnRoot = root;
}

function wirePatientTabs(root) {
    const tabs = root.querySelectorAll('.patient-tabs [role="tab"]');
    const panels = root.querySelectorAll('.patient-tab-panel');

    function syncPanels(activeId) {
        panels.forEach((panel) => {
            const on = panel.getAttribute('data-tabpanel') === activeId;
            panel.classList.toggle('is-active', on);
            panel.setAttribute('aria-hidden', on ? 'false' : 'true');
        });
    }

    tabs.forEach((btn) => {
        btn.addEventListener('click', () => {
            const id = btn.getAttribute('data-tab');
            tabs.forEach((b) => b.setAttribute('aria-selected', String(b === btn)));
            syncPanels(id);
            if (id === 'notes' && window._currentPatient) {
                loadDoctorNotes(window._currentPatient.id, root);
            }
        });
    });

    syncPanels('overview');
}

function renderDetail(p) {
    window._currentPatient = p;
    const dob = p.dateOfBirth;
    const age = ageFromDob(dob);
    const badges = [];
    if (p.deceased) {
        badges.push('<span class="badge badge-destructive">Deceased</span>');
    }
    if (p.organDonor === true) {
        badges.push('<span class="badge badge-accent">Organ donor</span>');
    } else if (p.organDonor === false) {
        badges.push('<span class="badge badge-muted">Not organ donor</span>');
    }

    const counts = p._count || {};
    const countChips = [
        ['Encounters', counts.encounters],
        ['Allergies', counts.allergies],
        ['Medical history', counts.medicalHistory],
        ['Care plans', counts.carePlans],
        ['Immunizations', counts.immunizations],
        ['Observations', counts.observations],
    ]
        .map(
            ([label, n]) =>
                `<span class="badge badge-muted patient-count-chip">${escapeHtml(label)}: <strong>${Number(n) || 0}</strong></span>`
        )
        .join('');

    const height =
        p.baselineHeightCm != null ? `${escapeHtml(String(p.baselineHeightCm))} cm` : '—';
    const weight =
        p.baselineWeightKg != null ? `${escapeHtml(String(p.baselineWeightKg))} kg` : '—';

    const overviewPanel = `
        <div class="patient-count-row">${countChips}</div>
        <dl class="patient-dl">
            ${dlRow('Date of birth', `${escapeHtml(formatDateOnly(dob))}${age != null ? ` <span class="text-muted">(${age} years)</span>` : ''}`)}
            ${dlRow('Sex', escapeHtml(labelSex(p.sex)))}
            ${dlRow('Blood group', escapeHtml(labelBlood(p.bloodGroup)))}
            ${dlRow('Genotype', escapeHtml(labelGenotype(p.genotype)))}
            ${dlRow('Baseline height', height)}
            ${dlRow('Baseline weight', weight)}
            ${dlRow('Deceased date', p.deceased ? escapeHtml(formatDateOnly(p.deceasedDate)) : '—')}
            ${dlRow('Created', escapeHtml(formatDateOnly(p.createdAt)))}
            ${dlRow('Updated', escapeHtml(formatDateOnly(p.updatedAt)))}
        </dl>`;

    detailBody.innerHTML = `
        <div class="patients-detail-header">
            <div>
                <h3 class="patients-detail-name">${escapeHtml(fullName(p))}</h3>
                <p class="text-muted patients-detail-sub">MRN <span class="font-mono">${escapeHtml(p.medicalRecordNumber)}</span></p>
            </div>
            <div class="patients-detail-badges">${badges.join('')}</div>
        </div>
        <div class="patient-tabs-wrap">
            <div class="patient-tabs" role="tablist" aria-label="Patient record sections">
                <button type="button" class="patient-tab" role="tab" aria-selected="true" data-tab="overview" id="ptab-overview">Overview</button>
                <button type="button" class="patient-tab" role="tab" aria-selected="false" data-tab="encounters" id="ptab-encounters">Encounters</button>
                <button type="button" class="patient-tab" role="tab" aria-selected="false" data-tab="allergies" id="ptab-allergies">Allergies</button>
                <button type="button" class="patient-tab" role="tab" aria-selected="false" data-tab="history" id="ptab-history">Medical history</button>
                <button type="button" class="patient-tab" role="tab" aria-selected="false" data-tab="care" id="ptab-care">Care plans</button>
                <button type="button" class="patient-tab" role="tab" aria-selected="false" data-tab="immunizations" id="ptab-immunizations">Immunizations</button>
                <button type="button" class="patient-tab" role="tab" aria-selected="false" data-tab="observations" id="ptab-observations">Observations</button>
                <button type="button" class="patient-tab" role="tab" aria-selected="false" data-tab="notes" id="ptab-notes">Doctor's notes</button>
            </div>
        </div>
        <div class="patient-tab-panels">
            <div class="patient-tab-panel is-active" role="tabpanel" data-tabpanel="overview" aria-labelledby="ptab-overview" aria-hidden="false">${overviewPanel}</div>
            <div class="patient-tab-panel" role="tabpanel" data-tabpanel="encounters" aria-labelledby="ptab-encounters" aria-hidden="true">${renderEncountersPanel(p.encounters)}</div>
            <div class="patient-tab-panel" role="tabpanel" data-tabpanel="allergies" aria-labelledby="ptab-allergies" aria-hidden="true">${renderAllergiesPanel(p.allergies)}</div>
            <div class="patient-tab-panel" role="tabpanel" data-tabpanel="history" aria-labelledby="ptab-history" aria-hidden="true">${renderMedicalHistoryPanel(p.medicalHistory)}</div>
            <div class="patient-tab-panel" role="tabpanel" data-tabpanel="care" aria-labelledby="ptab-care" aria-hidden="true">${renderCarePlansPanel(p.carePlans)}</div>
            <div class="patient-tab-panel" role="tabpanel" data-tabpanel="immunizations" aria-labelledby="ptab-immunizations" aria-hidden="true">${renderImmunizationsPanel(p.immunizations)}</div>
            <div class="patient-tab-panel" role="tabpanel" data-tabpanel="observations" aria-labelledby="ptab-observations" aria-hidden="true">${renderObservationsPanel(p.observations)}</div>
            <div class="patient-tab-panel" role="tabpanel" data-tabpanel="notes" aria-labelledby="ptab-notes" aria-hidden="true">${renderDoctorNotesPanel([], p.id)}</div>
        </div>`;

    wirePatientTabs(detailBody);
    // Wire the initial "Add note" button rendered in the notes panel placeholder
    wireAddNoteButton(detailBody.querySelector('[data-tabpanel="notes"]'), p.id, detailBody);
}

async function selectPatient(id) {
    if (!id) return;
    selectedPatientId = id;
    updateSelectionClasses();
    renderDetailLoading();

    let res;
    try {
        res = await fetch(`${API}/${encodeURIComponent(id)}`);
    } catch (e) {
        renderDetailPlaceholder('Network error', e.message || 'Could not reach server.');
        return;
    }

    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        renderDetailPlaceholder('Patient not found', err.error || res.statusText);
        return;
    }

    const patient = await res.json();
    renderDetail(patient);
}

document.addEventListener('DOMContentLoaded', () => {
    loadPatientList();
    refreshBtn.addEventListener('click', () => loadPatientList());
    searchInput.addEventListener(
        'input',
        debounce(() => {
            selectedPatientId = null;
            loadPatientList();
        }, 300)
    );

    // Doctor's note modal — close handlers
    const dnModal = document.getElementById('doctorNoteModal');
    document.getElementById('dnModalClose').addEventListener('click', () => { dnModal.style.display = 'none'; });
    document.getElementById('dnCancelBtn').addEventListener('click', () => { dnModal.style.display = 'none'; });
    dnModal.addEventListener('click', (e) => { if (e.target === dnModal) dnModal.style.display = 'none'; });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && dnModal.style.display === 'flex') dnModal.style.display = 'none'; });

    // Doctor's note modal — submit handler
    document.getElementById('dnSubmitBtn').addEventListener('click', async () => {
        const patientId = dnModal.dataset.patientId;
        const encounterId = document.getElementById('dnEncounterSelect').value;
        const noteText = document.getElementById('dnNoteText').value.trim();
        const noteType = document.getElementById('dnNoteType').value;
        const errEl = document.getElementById('dnErrorSection');
        const submitBtn = document.getElementById('dnSubmitBtn');

        if (!noteText) {
            errEl.textContent = 'Note text is required.';
            errEl.style.display = 'block';
            return;
        }

        submitBtn.disabled = true;
        submitBtn.textContent = 'Saving…';
        errEl.style.display = 'none';

        try {
            const res = await fetch(`${API}/${encodeURIComponent(patientId)}/notes`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ encounterId, noteText, noteType }),
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err.error || res.statusText);
            }
            dnModal.style.display = 'none';
            if (_dnRoot) loadDoctorNotes(patientId, _dnRoot);
        } catch (e) {
            errEl.textContent = e.message || 'Failed to save note.';
            errEl.style.display = 'block';
        } finally {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Save note';
        }
    });
});
