const API = `${window.location.origin}/api/patients`;

const searchInput = document.getElementById('searchInput');
const refreshBtn = document.getElementById('refreshBtn');
const patientsTableBody = document.getElementById('patientsTableBody');
const listMeta = document.getElementById('listMeta');
const detailBody = document.getElementById('detailBody');

let searchDebounceTimer = null;
let selectedPatientId = null;

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

function renderDetail(p) {
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

    detailBody.innerHTML = `
        <div class="patients-detail-header">
            <div>
                <h3 class="patients-detail-name">${escapeHtml(fullName(p))}</h3>
                <p class="text-muted patients-detail-sub">MRN <span class="font-mono">${escapeHtml(p.medicalRecordNumber)}</span></p>
            </div>
            <div class="patients-detail-badges">${badges.join('')}</div>
        </div>
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
});
