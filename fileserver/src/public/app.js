// DOM Elements
const uploadBtn = document.getElementById('uploadBtn');
const refreshBtn = document.getElementById('refreshBtn');
const uploadModal = document.getElementById('uploadModal');
const modalClose = document.getElementById('modalClose');
const cancelBtn = document.getElementById('cancelBtn');
const processBtn = document.getElementById('processBtn');
const fileInput = document.getElementById('fileInput');
const dropzone = document.getElementById('dropzone');
const dropzoneContent = document.getElementById('dropzoneContent');
const fileSelected = document.getElementById('fileSelected');
const selectedFileName = document.getElementById('selectedFileName');
const selectedFileSize = document.getElementById('selectedFileSize');
const removeFile = document.getElementById('removeFile');
const chunkSize = document.getElementById('chunkSize');
const chunkOverlap = document.getElementById('chunkOverlap');
const filesTableBody = document.getElementById('filesTableBody');

const uploadSection = document.getElementById('uploadSection');
const progressSection = document.getElementById('progressSection');
const errorSection = document.getElementById('errorSection');
const successSection = document.getElementById('successSection');

const progressTitle = document.getElementById('progressTitle');
const progressPercentage = document.getElementById('progressPercentage');
const progressFill = document.getElementById('progressFill');
const processBtnText = document.getElementById('processBtnText');
const processBtnLoading = document.getElementById('processBtnLoading');
const errorMessage = document.getElementById('errorMessage');
const successMessage = document.getElementById('successMessage');
const successStats = document.getElementById('successStats');

// State
let selectedFile = null;
let isProcessing = false;

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    loadFiles();
    setupEventListeners();
});

function setupEventListeners() {
    // Modal controls
    uploadBtn.addEventListener('click', openModal);
    modalClose.addEventListener('click', closeModal);
    cancelBtn.addEventListener('click', closeModal);
    
    // Click overlay to close
    uploadModal.addEventListener('click', (e) => {
        if (e.target === uploadModal) closeModal();
    });
    
    // Escape key to close
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && uploadModal.style.display !== 'none') {
            closeModal();
        }
    });
    
    // File selection
    dropzone.addEventListener('click', () => {
        if (!isProcessing) fileInput.click();
    });
    fileInput.addEventListener('change', handleFileSelect);
    
    // Drag and drop
    dropzone.addEventListener('dragover', handleDragOver);
    dropzone.addEventListener('dragleave', handleDragLeave);
    dropzone.addEventListener('drop', handleDrop);
    
    // File removal
    removeFile.addEventListener('click', (e) => {
        e.stopPropagation();
        clearSelectedFile();
    });
    
    // Process button
    processBtn.addEventListener('click', handleUpload);
    
    // Refresh files
    refreshBtn.addEventListener('click', loadFiles);
}

function openModal() {
    resetModal();
    uploadModal.style.display = 'flex';
}

function closeModal() {
    if (isProcessing && !confirm('Upload in progress. Are you sure you want to cancel?')) {
        return;
    }
    uploadModal.style.display = 'none';
    resetModal();
}

function resetModal() {
    clearSelectedFile();
    uploadSection.style.display = 'block';
    progressSection.style.display = 'none';
    errorSection.style.display = 'none';
    successSection.style.display = 'none';
    isProcessing = false;
    processBtn.disabled = true;
}

function handleFileSelect(e) {
    const file = e.target.files[0];
    if (file) {
        validateAndSelectFile(file);
    }
}

function handleDragOver(e) {
    e.preventDefault();
    dropzone.classList.add('dragover');
}

function handleDragLeave(e) {
    e.preventDefault();
    dropzone.classList.remove('dragover');
}

function handleDrop(e) {
    e.preventDefault();
    dropzone.classList.remove('dragover');
    
    const files = e.dataTransfer.files;
    if (files.length > 0) {
        validateAndSelectFile(files[0]);
    }
}

function validateAndSelectFile(file) {
    // Validate file type
    const allowedTypes = [
        'application/pdf',
        'text/plain',
        'text/csv',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ];
    
    const allowedExtensions = ['.pdf', '.txt', '.csv', '.doc', '.docx'];
    const fileExt = '.' + file.name.split('.').pop().toLowerCase();
    
    if (!allowedTypes.includes(file.type) && !allowedExtensions.includes(fileExt)) {
        showError('Invalid file type. Please select a PDF, DOC, DOCX, TXT, or CSV file.');
        return;
    }
    
    // Validate file size (10MB)
    const maxSize = 10 * 1024 * 1024;
    if (file.size > maxSize) {
        showError('File size exceeds 10MB limit. Please select a smaller file.');
        return;
    }
    
    // Validate file is not empty
    if (file.size === 0) {
        showError('File is empty. Please select a valid file.');
        return;
    }
    
    selectedFile = file;
    showSelectedFile(file);
}

function showSelectedFile(file) {
    selectedFileName.textContent = file.name;
    selectedFileSize.textContent = formatFileSize(file.size);
    dropzoneContent.style.display = 'none';
    fileSelected.style.display = 'flex';
    processBtn.disabled = false;
    hideError();
}

function clearSelectedFile() {
    selectedFile = null;
    fileInput.value = '';
    dropzoneContent.style.display = 'flex';
    fileSelected.style.display = 'none';
    processBtn.disabled = true;
}

function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

async function handleUpload() {
    if (!selectedFile || isProcessing) return;
    
    // Validate configuration
    const chunkSizeValue = parseInt(chunkSize.value);
    const chunkOverlapValue = parseInt(chunkOverlap.value);
    
    if (chunkSizeValue < 100 || chunkSizeValue > 2000) {
        showError('Chunk size must be between 100 and 2000 characters.');
        return;
    }
    
    if (chunkOverlapValue < 0 || chunkOverlapValue > 500) {
        showError('Chunk overlap must be between 0 and 500 characters.');
        return;
    }
    
    if (chunkOverlapValue >= chunkSizeValue) {
        showError('Chunk overlap must be less than chunk size.');
        return;
    }
    
    isProcessing = true;
    processBtn.disabled = true;
    processBtnText.style.display = 'none';
    processBtnLoading.style.display = 'inline-flex';
    
    // Hide upload section, show progress
    uploadSection.style.display = 'none';
    progressSection.style.display = 'block';
    errorSection.style.display = 'none';
    successSection.style.display = 'none';
    
    // Reset progress
    updateProgress(0, 'Starting upload...');
    resetSteps();
    
    try {
        // Create form data
        const formData = new FormData();
        formData.append('file', selectedFile);
        formData.append('chunkSize', chunkSizeValue);
        formData.append('chunkOverlap', chunkOverlapValue);
        
        // Step 1: Upload
        updateStepStatus('upload', 'active', 'Uploading file to server...');
        updateProgress(10, 'Uploading file...');
        
        // Upload with timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 120000); // 2 minute timeout
        
        const response = await fetch('/files/upload', {
            method: 'POST',
            body: formData,
            signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ error: 'Upload failed' }));
            throw new Error(errorData.error || `Upload failed with status ${response.status}`);
        }
        
        const result = await response.json();
        
        if (result.error) {
            throw new Error(result.error);
        }
        
        // Process steps based on result
        await processStepsFromResult(result);
        
        // Show success
        showSuccess(result);
        
        // Refresh files list
        await loadFiles();
        
        showToast('Document processed successfully!', 'success');
        
        // Auto-close after 3 seconds
        setTimeout(() => {
            if (uploadModal.style.display !== 'none') {
                closeModal();
            }
        }, 3000);
        
    } catch (error) {
        console.error('Upload error:', error);
        
        let errorMsg = 'An unexpected error occurred';
        
        if (error.name === 'AbortError') {
            errorMsg = 'Upload timed out. The file may be too large or the server is not responding.';
        } else if (error.message) {
            errorMsg = error.message;
        }
        
        // Mark current step as error
        markCurrentStepAsError();
        
        showError(errorMsg);
        showToast('Upload failed: ' + errorMsg, 'error');
        
    } finally {
        isProcessing = false;
        processBtn.disabled = false;
        processBtnText.style.display = 'inline';
        processBtnLoading.style.display = 'none';
    }
}

async function processStepsFromResult(result) {
    const steps = result.processing?.steps || [];
    
    // Map backend step names to UI step IDs
    const stepMapping = {
        'file_save': 'upload',
        'text_extraction': 'extract',
        'text_chunking': 'chunk',
        'embeddings': 'embed',
        'vector_storage': 'store'
    };
    
    // Process each step with proper timing
    for (let i = 0; i < steps.length; i++) {
        const backendStep = steps[i];
        const uiStepId = stepMapping[backendStep.step];
        
        if (!uiStepId) continue;
        
        // Mark as active
        updateStepStatus(uiStepId, 'active', getStepActiveMessage(backendStep.step));
        updateProgress(20 + (i * 16), getStepProgressMessage(backendStep.step));
        await delay(300);
        
        // Mark as completed with details
        const completedMessage = getStepCompletedMessage(backendStep);
        updateStepStatus(uiStepId, 'completed', completedMessage);
        await delay(200);
    }
    
    updateProgress(100, 'Complete!');
}

function getStepActiveMessage(stepName) {
    const messages = {
        'file_save': 'Uploading file to server...',
        'text_extraction': 'Extracting text from document...',
        'text_chunking': 'Splitting text into chunks...',
        'embeddings': 'Generating AI embeddings...',
        'vector_storage': 'Storing vectors in database...'
    };
    return messages[stepName] || 'Processing...';
}

function getStepProgressMessage(stepName) {
    const messages = {
        'file_save': 'File uploaded',
        'text_extraction': 'Extracting text...',
        'text_chunking': 'Creating chunks...',
        'embeddings': 'Generating embeddings...',
        'vector_storage': 'Storing vectors...'
    };
    return messages[stepName] || 'Processing...';
}

function getStepCompletedMessage(backendStep) {
    switch (backendStep.step) {
        case 'file_save':
            return 'File saved successfully';
        case 'text_extraction':
            return backendStep.textLength 
                ? `Extracted ${backendStep.textLength.toLocaleString()} characters`
                : 'Text extracted';
        case 'text_chunking':
            return backendStep.chunkCount 
                ? `Created ${backendStep.chunkCount} chunks`
                : 'Chunks created';
        case 'embeddings':
            return backendStep.embeddingCount 
                ? `Generated ${backendStep.embeddingCount} embeddings`
                : 'Embeddings generated';
        case 'vector_storage':
            return backendStep.pointCount 
                ? `Stored ${backendStep.pointCount} vectors`
                : 'Vectors stored';
        default:
            return 'Completed';
    }
}

function resetSteps() {
    const steps = ['upload', 'extract', 'chunk', 'embed', 'store'];
    steps.forEach(step => {
        const stepEl = document.querySelector(`[data-step="${step}"]`);
        if (stepEl) {
            stepEl.className = 'step';
            const icon = stepEl.querySelector('.step-icon');
            const desc = document.getElementById(`step-${step}-desc`);
            
            if (icon) icon.textContent = getStepNumber(step);
            if (desc) desc.textContent = 'Waiting to start...';
        }
    });
}

function getStepNumber(step) {
    const numbers = { upload: '1', extract: '2', chunk: '3', embed: '4', store: '5' };
    return numbers[step] || '?';
}

function updateStepStatus(step, status, description) {
    const stepEl = document.querySelector(`[data-step="${step}"]`);
    if (!stepEl) return;
    
    stepEl.className = `step ${status}`;
    
    const icon = stepEl.querySelector('.step-icon');
    const desc = document.getElementById(`step-${step}-desc`);
    
    if (icon) {
        if (status === 'completed') {
            icon.textContent = '✓';
        } else if (status === 'error') {
            icon.textContent = '✕';
        } else {
            icon.textContent = getStepNumber(step);
        }
    }
    
    if (desc && description) {
        desc.textContent = description;
    }
}

function markCurrentStepAsError() {
    const activeStep = document.querySelector('.step.active');
    if (activeStep) {
        const stepName = activeStep.getAttribute('data-step');
        updateStepStatus(stepName, 'error', 'Failed');
    }
}

function updateProgress(percentage, title) {
    progressFill.style.width = `${percentage}%`;
    progressPercentage.textContent = `${Math.round(percentage)}%`;
    if (title) progressTitle.textContent = title;
}

function showSuccess(result) {
    successSection.style.display = 'block';
    
    const stats = result.processing?.stats || {};
    const fileData = result.file || {};
    
    successMessage.textContent = `Successfully processed "${fileData.name || 'document'}"`;
    
    successStats.innerHTML = `
        <div class="stat">
            <div class="stat-value">${stats.textLength?.toLocaleString() || 0}</div>
            <div class="stat-label">Characters</div>
        </div>
        <div class="stat">
            <div class="stat-value">${stats.chunkCount || 0}</div>
            <div class="stat-label">Chunks</div>
        </div>
        <div class="stat">
            <div class="stat-value">${stats.vectorCount || 0}</div>
            <div class="stat-label">Vectors</div>
        </div>
        <div class="stat">
            <div class="stat-value">${formatFileSize(fileData.size || 0)}</div>
            <div class="stat-label">File Size</div>
        </div>
    `;
}

function showError(message) {
    errorSection.style.display = 'block';
    errorMessage.textContent = message;
}

function hideError() {
    errorSection.style.display = 'none';
}

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Load and display files
async function loadFiles() {
    try {
        const response = await fetch('/files');
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.error || 'Failed to load files');
        }
        
        displayFiles(data.files || []);
        
    } catch (error) {
        console.error('Error loading files:', error);
        showToast('Failed to load files: ' + error.message, 'error');
    }
}

function displayFiles(files) {
    if (files.length === 0) {
        filesTableBody.innerHTML = `
            <tr>
                <td colspan="6" class="empty-state">
                    <div class="empty-state-content">
                        <svg class="empty-icon" xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                            <polyline points="14 2 14 8 20 8"></polyline>
                        </svg>
                        <p class="empty-title">No documents uploaded</p>
                        <p class="empty-description">Upload your first document to get started</p>
                    </div>
                </td>
            </tr>
        `;
        return;
    }
    
    filesTableBody.innerHTML = files.map(file => {
        const uploadDate = new Date(file.uploadDate);
        const vectors = file.stats?.vectorCount || file.processingStats?.vectorCount || 0;
        
        return `
            <tr>
                <td>
                    <div style="display: flex; align-items: center; gap: 0.5rem;">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color: hsl(var(--muted-foreground));">
                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                            <polyline points="14 2 14 8 20 8"></polyline>
                        </svg>
                        <span>${escapeHtml(file.name)}</span>
                    </div>
                </td>
                <td><span class="badge">${getFileType(file.type)}</span></td>
                <td>${formatFileSize(file.size)}</td>
                <td>${vectors > 0 ? vectors.toLocaleString() : '-'}</td>
                <td>${uploadDate.toLocaleDateString()} ${uploadDate.toLocaleTimeString()}</td>
                <td class="text-right">
                    <div style="display: flex; gap: 0.5rem; justify-content: flex-end;">
                        <button class="btn btn-ghost btn-sm" onclick="downloadFile('${file.id}')" title="Download">
                            <svg class="icon" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                                <polyline points="7 10 12 15 17 10"></polyline>
                                <line x1="12" y1="15" x2="12" y2="3"></line>
                            </svg>
                        </button>
                        <button class="btn btn-destructive btn-sm" onclick="deleteFile('${file.id}')" title="Delete">
                            <svg class="icon" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <polyline points="3 6 5 6 21 6"></polyline>
                                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                            </svg>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

function getFileType(mimetype) {
    if (mimetype.includes('pdf')) return 'PDF';
    if (mimetype.includes('word') || mimetype.includes('document')) return 'DOC';
    if (mimetype.includes('text')) return 'TXT';
    if (mimetype.includes('csv')) return 'CSV';
    return 'FILE';
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

async function downloadFile(fileId) {
    try {
        const response = await fetch(`/files/${fileId}/download`);
        const data = await response.json();
        
        if (!response.ok || data.error) {
            throw new Error(data.error || 'Download failed');
        }
        
        // Create a link and trigger download
        const link = document.createElement('a');
        link.href = data.file.path;
        link.download = data.file.originalName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        showToast('Download started', 'success');
        
    } catch (error) {
        console.error('Download error:', error);
        showToast('Download failed: ' + error.message, 'error');
    }
}

async function deleteFile(fileId) {
    if (!confirm('Are you sure you want to delete this document? This action cannot be undone.')) {
        return;
    }
    
    try {
        const response = await fetch(`/files/${fileId}`, {
            method: 'DELETE'
        });
        
        const data = await response.json();
        
        if (!response.ok || data.error) {
            throw new Error(data.error || 'Delete failed');
        }
        
        showToast('Document deleted successfully', 'success');
        await loadFiles();
        
    } catch (error) {
        console.error('Delete error:', error);
        showToast('Delete failed: ' + error.message, 'error');
    }
}

// Toast notifications
function showToast(message, type = 'success') {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `<div class="toast-content">${escapeHtml(message)}</div>`;
    
    const container = document.getElementById('toastContainer');
    container.appendChild(toast);
    
    setTimeout(() => {
        toast.style.animation = 'slideInRight 0.3s reverse';
        setTimeout(() => {
            container.removeChild(toast);
        }, 300);
    }, 3000);
}

// Make functions globally available
window.downloadFile = downloadFile;
window.deleteFile = deleteFile;
