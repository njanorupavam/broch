let studentsData = [];
let originalStudentsData = []; // deep-copy baseline for photo resets
let currentView = 'directory';
let activeUploadEmail = '';
let activeEditEmail = '';
let baseStudentsData = [];
let importedFiles = [];
let inlineTextEditing = false;
const IMPORTED_FILES_KEY = 'brochure_imported_xlsx_files_v1';
const FRONT_PAGE_NAME_KEY = 'brochure_front_page_name_v1';
const MANUAL_STUDENTS_KEY = 'brochure_manual_students_v1';
const DELETED_STUDENTS_KEY = 'brochure_deleted_students_v1';
const BROCHURE_PALETTE_KEY = 'makebro_palette_v1';
const DEFAULT_BROCHURE_PALETTE = { primary: '#074c30', accent: '#f3b02b' };

function hexToRgb(hex) {
  const value = hex.replace('#', '');
  return {
    r: parseInt(value.slice(0, 2), 16),
    g: parseInt(value.slice(2, 4), 16),
    b: parseInt(value.slice(4, 6), 16),
  };
}

function mixHex(hex, target, amount) {
  const source = hexToRgb(hex);
  const mixed = ['r', 'g', 'b'].map(channel =>
    Math.round(source[channel] + (target - source[channel]) * amount)
      .toString(16).padStart(2, '0')
  );
  return `#${mixed.join('')}`;
}

function applyBrochurePalette(primary, accent, persist = true) {
  const root = document.documentElement;
  const primaryRgb = hexToRgb(primary);
  root.style.setProperty('--primary-green', primary);
  root.style.setProperty('--primary-green-rgb', `${primaryRgb.r}, ${primaryRgb.g}, ${primaryRgb.b}`);
  root.style.setProperty('--dark-green', mixHex(primary, 0, 0.48));
  root.style.setProperty('--light-green', mixHex(primary, 255, 0.9));
  root.style.setProperty('--badge-text-green', primary);
  root.style.setProperty('--card-gradient-start', mixHex(primary, 0, 0.12));
  root.style.setProperty('--card-gradient-end', mixHex(primary, 0, 0.55));
  root.style.setProperty('--accent-orange', accent);
  root.style.setProperty('--accent-orange-hover', mixHex(accent, 0, 0.12));

  const primaryInput = document.getElementById('palette-primary');
  const accentInput = document.getElementById('palette-accent');
  if (primaryInput) primaryInput.value = primary;
  if (accentInput) accentInput.value = accent;
  const primaryValue = document.getElementById('palette-primary-value');
  const accentValue = document.getElementById('palette-accent-value');
  if (primaryValue) primaryValue.value = primary.toUpperCase();
  if (accentValue) accentValue.value = accent.toUpperCase();
  if (persist) localStorage.setItem(BROCHURE_PALETTE_KEY, JSON.stringify({ primary, accent }));
}

function updateBrochurePalette() {
  const primary = document.getElementById('palette-primary')?.value || DEFAULT_BROCHURE_PALETTE.primary;
  const accent = document.getElementById('palette-accent')?.value || DEFAULT_BROCHURE_PALETTE.accent;
  applyBrochurePalette(primary, accent);
}

function applyPalettePreset(primary, accent) {
  applyBrochurePalette(primary, accent);
}

function resetBrochurePalette() {
  localStorage.removeItem(BROCHURE_PALETTE_KEY);
  applyBrochurePalette(DEFAULT_BROCHURE_PALETTE.primary, DEFAULT_BROCHURE_PALETTE.accent, false);
}

function loadBrochurePalette() {
  try {
    const saved = JSON.parse(localStorage.getItem(BROCHURE_PALETTE_KEY) || 'null');
    if (saved?.primary && saved?.accent) {
      applyBrochurePalette(saved.primary, saved.accent, false);
      return;
    }
  } catch (error) {}
  applyBrochurePalette(DEFAULT_BROCHURE_PALETTE.primary, DEFAULT_BROCHURE_PALETTE.accent, false);
}

function readStoredArray(key) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || '[]');
    return Array.isArray(value) ? value : [];
  } catch (error) {
    return [];
  }
}

function studentIdentity(student) {
  return (student.email || student.name || '').trim().toLowerCase();
}

// Uploading a workbook is an explicit request to include its students again.
// Clear matching removal markers before rebuilding from saved imports.
function restoreImportedStudentDeletions(importedStudents) {
  const importedIdentities = new Set(importedStudents.map(studentIdentity).filter(Boolean));
  if (!importedIdentities.size) return;
  const deletedStudents = readStoredArray(DELETED_STUDENTS_KEY);
  const remainingDeletions = deletedStudents.filter(identity => !importedIdentities.has(identity));
  if (remainingDeletions.length !== deletedStudents.length) {
    localStorage.setItem(DELETED_STUDENTS_KEY, JSON.stringify(remainingDeletions));
  }
}

function updateFrontPageName(value) {
  const name = (value || '').trim();
  if (name) localStorage.setItem(FRONT_PAGE_NAME_KEY, name);
  else localStorage.removeItem(FRONT_PAGE_NAME_KEY);
  filterData();
}

function updateStreamProgramLabel(fileName = '') {
  const label = document.getElementById('filter-stream-label');
  if (!label) return;
  label.textContent = fileName
    ? `Stream / Program (${fileName})`
    : 'Stream / Program';
}

function saveImportedFiles() {
  try {
    localStorage.setItem(IMPORTED_FILES_KEY, JSON.stringify(importedFiles));
  } catch (error) {
    console.warn('Could not persist imported XLSX data:', error);
    showImportToast('The file was imported, but is too large to save in this browser.', 'error');
  }
}

function renderImportedFiles() {
  const container = document.getElementById('imported-files');
  if (!container) return;
  container.innerHTML = '';
  if (!importedFiles.length) {
    const empty = document.createElement('span');
    empty.className = 'imported-files-empty';
    empty.textContent = 'No uploaded files yet. Use Import XLSX to add one.';
    container.appendChild(empty);
    return;
  }
  importedFiles.forEach(file => {
    const item = document.createElement('span');
    item.className = 'imported-file';
    item.title = file.name;
    const name = document.createElement('span');
    name.className = 'imported-file-name';
    name.textContent = file.name;
    const remove = document.createElement('button');
    remove.className = 'imported-file-delete';
    remove.type = 'button';
    remove.innerHTML = '<span aria-hidden="true">\ud83d\uddd1</span> Delete';
    remove.title = `Delete ${file.name}`;
    remove.setAttribute('aria-label', `Delete ${file.name}`);
    remove.onclick = () => deleteImportedFile(file.id);
    item.append(name, remove);
    container.appendChild(item);
  });
}

function deleteImportedFile(id) {
  const file = importedFiles.find(item => item.id === id);
  if (!file || !confirm(`Delete imported file "${file.name}"?`)) return;
  importedFiles = importedFiles.filter(item => item.id !== id);
  saveImportedFiles();
  rebuildStudentsFromImports();
  showImportToast(`Deleted ${file.name}.`, 'success');
}

function applyImportedStudents(targetStudents, importedStudents) {
  let added = 0, updated = 0, skipped = 0;
  let nextId = targetStudents.reduce((m, s) => Math.max(m, Number(s.id) || 0), 0) + 1;
  importedStudents.forEach(incoming => {
    const repairedSkills = (incoming.skills || []).map(skill => {
      if (skill && skill.title && !skill.description) return parseSkillCell(skill.title);
      return skill;
    }).filter(Boolean);
    const repairedKeywords = (incoming.keywords || []).flatMap(keyword =>
      String(keyword).split(/[,\n;|\u2022\u00b7]+/).map(item => item.trim()).filter(Boolean)
    );
    if (!incoming.name && !incoming.email) { skipped++; return; }
    const email = (incoming.email || '').toLowerCase();
    const normalizedName = (incoming.name || '').toLowerCase();
    const existing = targetStudents.find(s =>
      (email && (s.email || '').toLowerCase() === email) ||
      (!email && normalizedName && (s.name || '').toLowerCase() === normalizedName)
    );
    if (existing) {
      ['name', 'email', 'raw_stream', 'photo_url', 'photo_id', 'linkedin', 'github'].forEach(key => {
        if (incoming[key]) existing[key] = incoming[key];
      });
      if (incoming.raw_stream) existing.streams = [incoming.raw_stream];
      if (repairedSkills.length) existing.skills = repairedSkills;
      if (repairedKeywords.length) existing.keywords = repairedKeywords;
      updated++;
    } else {
      targetStudents.push({ ...incoming, skills: repairedSkills, keywords: repairedKeywords, id: nextId++ });
      added++;
    }
  });
  return { added, updated, skipped };
}

function rebuildStudentsFromImports() {
  studentsData = baseStudentsData.map(student => ({ ...student }));
  importedFiles.forEach(file => applyImportedStudents(studentsData, file.students || []));
  applyImportedStudents(studentsData, readStoredArray(MANUAL_STUDENTS_KEY));
  const deletedStudents = new Set(readStoredArray(DELETED_STUDENTS_KEY));
  studentsData = studentsData.filter(student => !deletedStudents.has(studentIdentity(student)));
  loadManualEdits();
  originalStudentsData = studentsData.map(student => ({ ...student }));
  loadManualPhotos();
  refreshStreamFilterOptions();
  renderImportedFiles();
  updateStreamProgramLabel(importedFiles.length ? `${importedFiles.length} files` : '');
  filterData();
}

function getRowValue(row, aliases) {
  const normalized = Object.fromEntries(Object.entries(row).map(([key, value]) => [
    key.toLowerCase().replace(/[^a-z0-9]/g, ''), value
  ]));
  for (const alias of aliases) {
    const value = normalized[alias.toLowerCase().replace(/[^a-z0-9]/g, '')];
    if (value !== undefined && value !== null) return value.toString().trim();
  }
  return '';
}

function getStudentStreams(student) {
  const values = [];
  if (student && typeof student.raw_stream === 'string' && student.raw_stream.trim()) {
    values.push(student.raw_stream.trim());
  }
  if (student && Array.isArray(student.streams)) {
    student.streams.forEach(s => {
      const text = (s || '').toString().trim();
      if (text) values.push(text);
    });
  }
  return [...new Set(values)];
}

function refreshStreamFilterOptions() {
  const select = document.getElementById('filter-stream');
  if (!select) return;
  const previousValue = select.value || 'all';
  const streams = [...new Set(studentsData.flatMap(getStudentStreams))]
    .sort((a, b) => a.localeCompare(b));
  select.innerHTML = '<option value="all">All Streams</option>';
  streams.forEach(stream => {
    const option = document.createElement('option');
    option.value = stream;
    option.textContent = stream;
    select.appendChild(option);
  });
  select.value = streams.includes(previousValue) ? previousValue : 'all';
}

// ── AI EDITOR ASSISTANT ─────────────────────────────────────────────────────

let assistantOpen = false;

function toggleAssistant() {
  const panel = document.getElementById('assistant-panel');
  assistantOpen = !assistantOpen;
  if (assistantOpen) {
    panel.classList.add('open');
    document.getElementById('assistant-input').focus();
  } else {
    panel.classList.remove('open');
  }
}

function addMessage(text, type = 'bot', status = '') {
  const msgs = document.getElementById('assistant-messages');
  const div = document.createElement('div');
  div.className = type === 'user' ? 'msg-user' : `msg-bot ${status}`;
  div.innerHTML = text;
  msgs.appendChild(div);
  msgs.scrollTop = msgs.scrollHeight;
}

function sendAssistantMessage() {
  const input = document.getElementById('assistant-input');
  const text = input.value.trim();
  if (!text) return;
  input.value = '';
  addMessage(text, 'user');
  setTimeout(() => processCommand(text), 200);
}

// Commands are often copied from the examples with their surrounding quote.
// Remove that presentation-only wrapper before matching the command grammar.
function normalizeAssistantCommand(raw) {
  let text = String(raw || '').trim();
  const wrappers = [
    ["'", "'"],
    ['\u2018', '\u2019'],
    ['\u2019', '\u2019'],
    ['`', '`'],
  ];
  const wrapper = wrappers.find(([open, close]) =>
    text.startsWith(open) && text.endsWith(close) && text.length > open.length + close.length
  );
  if (wrapper) text = text.slice(wrapper[0].length, -wrapper[1].length).trim();
  return text;
}

// Fuzzy name matcher — find best matching student for a name fragment
function findStudentByName(fragment) {
  const q = fragment.toLowerCase().replace(/[''']/g, '').trim();
  // Exact match first
  let match = studentsData.find(s => s.name.toLowerCase() === q);
  if (match) return match;
  // Starts with
  match = studentsData.find(s => s.name.toLowerCase().startsWith(q));
  if (match) return match;
  // Contains all query words
  const words = q.split(/\s+/);
  match = studentsData.find(s => words.every(w => s.name.toLowerCase().includes(w)));
  if (match) return match;
  // Any word match (first word of query)
  match = studentsData.find(s => s.name.toLowerCase().includes(words[0]));
  return match || null;
}

// Persist student edits to localStorage
function persistStudentEdits(student) {
  const payload = {
    name: student.name, email: student.email,
    linkedin: student.linkedin, github: student.github,
    keywords: student.keywords, skills: student.skills,
  };
  localStorage.setItem(`student_edits_${student.email}`, JSON.stringify(payload));
}

// Main command parser
function processCommand(raw) {
  const text = normalizeAssistantCommand(raw);
  const lower = text.toLowerCase();

  // Add a headed work description after a student's existing entries.
  const addDescriptionPattern = /^add\s+(?:a\s+)?new\s+description\s+["“](.+?)["”]\s+["“](.+?)["”]\s+(?:to|for)\s+["“](.+?)["”]$/i;
  let m = text.match(addDescriptionPattern);
  if (m) {
    const [, heading, content, nameFrag] = m;
    const student = findStudentByName(nameFrag.trim());
    if (!student) return addMessage(`❌ Couldn't find student <strong>"${escapeHtml(nameFrag.trim())}"</strong>.`, 'bot', 'error');
    student.skills = Array.isArray(student.skills) ? student.skills : [];
    student.skills.push({ title: heading.trim(), description: content.trim() });
    persistStudentEdits(student);
    filterData();
    return addMessage(`✅ Added <strong>${escapeHtml(heading.trim())}</strong> after ${escapeHtml(student.name)}'s existing work.`, 'bot', 'success');
  }

  const missingHeadingPattern = /^add\s+(?:a\s+)?new\s+description\s+["“](.+?)["”]\s+(?:to|for)\s+["“](.+?)["”]$/i;
  if (missingHeadingPattern.test(text)) {
    return addMessage('⚠️ Please include both a heading and description:<br><strong>\'Add a new description "Heading" "Content" to "Student Name"\'</strong>', 'bot', 'error');
  }

  // Remove a work entry by student name and matching content.
  const removeContentPattern = /^remove\s+["“](.+?)["”]\s+["“](.+?)["”]$/i;
  m = text.match(removeContentPattern);
  if (m) {
    const [, nameFrag, content] = m;
    const student = findStudentByName(nameFrag.trim());
    if (!student) return addMessage(`❌ Couldn't find student <strong>"${escapeHtml(nameFrag.trim())}"</strong>.`, 'bot', 'error');
    const needle = content.trim().toLowerCase();
    const skills = Array.isArray(student.skills) ? student.skills : [];
    const before = skills.length;
    student.skills = skills.filter(skill =>
      !`${skill.title || ''} ${skill.description || ''}`.toLowerCase().includes(needle)
    );
    if (student.skills.length === before) {
      return addMessage(`⚠️ No work matching <strong>"${escapeHtml(content.trim())}"</strong> was found for ${escapeHtml(student.name)}.`, 'bot', 'error');
    }
    persistStudentEdits(student);
    filterData();
    return addMessage(`✅ Removed the matching content from <strong>${escapeHtml(student.name)}</strong>.`, 'bot', 'success');
  }

  // ── Pattern: Change/Fix/Set/Update [name]'s [field] to [value]
  const changePattern = /^(?:change|fix|set|update|correct)\s+(.+?)(?:'s|'s|s)?\s+(name|email|linkedin|github|keyword[s]?|skill[s]?)\s+to\s+(.+)$/i;
  m = text.match(changePattern);
  if (m) {
    const [, nameFrag, field, value] = m;
    const student = findStudentByName(nameFrag.trim());
    if (!student) return addMessage(`❌ Couldn't find a student matching <strong>"${nameFrag.trim()}"</strong>. Try a more specific name.`, 'bot', 'error');
    return applyFieldChange(student, field.toLowerCase(), value.trim());
  }

  // ── Pattern: Add skill [skill text] to [name]
  const addSkillPattern = /^add\s+skill\s+(.+?)\s+to\s+(.+)$/i;
  m = text.match(addSkillPattern);
  if (m) {
    const [, skillText, nameFrag] = m;
    const student = findStudentByName(nameFrag.trim());
    if (!student) return addMessage(`❌ Couldn't find student <strong>"${nameFrag.trim()}"</strong>.`, 'bot', 'error');
    const skill = skillText.trim();
    const normalizedSkill = skill.toLowerCase();
    student.keywords = Array.isArray(student.keywords) ? student.keywords : [];
    student.skills = Array.isArray(student.skills) ? student.skills : [];

    // Badges are rendered from keywords. Repair matching empty headings that
    // may have been created by the previous implementation of this command.
    student.skills = student.skills.filter(entry =>
      !(!String(entry.description || '').trim() && String(entry.title || '').trim().toLowerCase() === normalizedSkill)
    );
    if (!student.keywords.some(keyword => String(keyword).trim().toLowerCase() === normalizedSkill)) {
      student.keywords.push(skill);
    }
    persistStudentEdits(student);
    filterData();
    return addMessage(`✅ Added skill badge <strong>"${skill}"</strong> to <strong>${student.name}</strong>.`, 'bot', 'success');
  }

  // ── Pattern: Remove skill [skill text] from [name]
  const removeSkillPattern = /^remove\s+skill\s+(.+?)\s+from\s+(.+)$/i;
  m = text.match(removeSkillPattern);
  if (m) {
    const [, skillText, nameFrag] = m;
    const student = findStudentByName(nameFrag.trim());
    if (!student) return addMessage(`❌ Couldn't find student <strong>"${nameFrag.trim()}"</strong>.`, 'bot', 'error');
    const needle = skillText.trim().toLowerCase();
    student.keywords = Array.isArray(student.keywords) ? student.keywords : [];
    student.skills = Array.isArray(student.skills) ? student.skills : [];
    const keywordCount = student.keywords.length;
    const headingCount = student.skills.length;
    student.keywords = student.keywords.filter(keyword => String(keyword).trim().toLowerCase() !== needle);
    student.skills = student.skills.filter(entry =>
      !(!String(entry.description || '').trim() && String(entry.title || '').trim().toLowerCase() === needle)
    );
    if (student.keywords.length === keywordCount && student.skills.length === headingCount) {
      return addMessage(`⚠️ No skill matching <strong>"${skillText}"</strong> found for ${student.name}.`, 'bot', 'error');
    }
    persistStudentEdits(student);
    filterData();
    return addMessage(`✅ Removed skill badge <strong>"${skillText}"</strong> from <strong>${student.name}</strong>.`, 'bot', 'success');
  }

  // ── Pattern: Add keyword [kw] to [name]
  const addKwPattern = /^add\s+keyword\s+(.+?)\s+to\s+(.+)$/i;
  m = text.match(addKwPattern);
  if (m) {
    const [, kw, nameFrag] = m;
    const student = findStudentByName(nameFrag.trim());
    if (!student) return addMessage(`❌ Couldn't find student <strong>"${nameFrag.trim()}"</strong>.`, 'bot', 'error');
    if (!student.keywords.includes(kw.trim())) student.keywords.push(kw.trim());
    persistStudentEdits(student);
    filterData();
    return addMessage(`✅ Added keyword <strong>"${kw.trim()}"</strong> to <strong>${student.name}</strong>.`, 'bot', 'success');
  }

  // ── Pattern: Remove keyword [kw] from [name]
  const removeKwPattern = /^remove\s+keyword\s+(.+?)\s+from\s+(.+)$/i;
  m = text.match(removeKwPattern);
  if (m) {
    const [, kw, nameFrag] = m;
    const student = findStudentByName(nameFrag.trim());
    if (!student) return addMessage(`❌ Couldn't find student <strong>"${nameFrag.trim()}"</strong>.`, 'bot', 'error');
    student.keywords = student.keywords.filter(k => !k.toLowerCase().includes(kw.toLowerCase()));
    persistStudentEdits(student);
    filterData();
    return addMessage(`✅ Removed keyword <strong>"${kw}"</strong> from <strong>${student.name}</strong>.`, 'bot', 'success');
  }

  // ── Pattern: Show/List [name]
  const showPattern = /^(?:show|list|find|info)\s+(.+)$/i;
  m = text.match(showPattern);
  if (m) {
    const student = findStudentByName(m[1].trim());
    if (!student) return addMessage(`❌ No student matching <strong>"${m[1].trim()}"</strong> found.`, 'bot', 'error');
    return addMessage(`
      <strong>${student.name}</strong><br>
      📧 ${student.email || '—'}<br>
      🔗 LinkedIn: ${student.linkedin || '—'}<br>
      💻 GitHub: ${student.github || '—'}<br>
      🏷 Keywords: ${(student.keywords || []).join(', ') || '—'}<br>
      🛠 Skills: ${(student.skills || []).map(s => s.title).join(', ') || '—'}
    `, 'bot', 'success');
  }

  // Fallback
  addMessage(`🤔 I didn't understand that. Try something like:<br>
    <strong>"Change [name]'s email to ..."</strong><br>
    <strong>'Add a new description "Heading" "Content" to "Student Name"'</strong><br>
    <strong>'Remove "Student Name" "content"'</strong><br>
    <strong>"Add skill [skill] to [name]"</strong><br>
    <strong>"Show [name]"</strong>`, 'bot', 'error');
}

function applyFieldChange(student, field, value) {
  const oldEmail = student.email;
  let msg = '';

  if (field === 'name') {
    student.name = value;
    msg = `✅ Set <strong>${student.name}</strong>'s name to <strong>"${value}"</strong>.`;
  } else if (field === 'email') {
    // Migrate localStorage keys if email changes
    const photoKey = localStorage.getItem(`student_photo_${oldEmail}`);
    if (photoKey) { localStorage.setItem(`student_photo_${value}`, photoKey); localStorage.removeItem(`student_photo_${oldEmail}`); }
    student.email = value;
    msg = `✅ Updated email to <strong>${value}</strong>.`;
  } else if (field === 'linkedin') {
    student.linkedin = value;
    msg = `✅ Updated <strong>${student.name}</strong>'s LinkedIn to <strong>${value}</strong>.`;
  } else if (field === 'github') {
    student.github = value;
    msg = `✅ Updated <strong>${student.name}</strong>'s GitHub to <strong>${value}</strong>.`;
  } else if (field.startsWith('keyword')) {
    student.keywords = value.split(',').map(k => k.trim()).filter(Boolean);
    msg = `✅ Set <strong>${student.name}</strong>'s keywords to: <strong>${student.keywords.join(', ')}</strong>.`;
  } else if (field.startsWith('skill')) {
    // Replace all skills with a single new skill entry
    student.skills = [{ title: value, description: '' }];
    msg = `✅ Set <strong>${student.name}</strong>'s primary skill to <strong>"${value}"</strong>.<br><small>Tip: Use "Add skill ... to ..." to add more.</small>`;
  } else {
    return addMessage(`⚠️ Unknown field <strong>"${field}"</strong>. Supported: name, email, linkedin, github, keywords, skills.`, 'bot', 'error');
  }

  persistStudentEdits(student);
  filterData();
  addMessage(msg, 'bot', 'success');
}

// ── EDIT STUDENT MODAL ──────────────────────────────────────────────────────

// Open the edit modal for a given student
function openEditModal(email) {
  const student = studentsData.find(s => s.email === email);
  if (!student) return;
  activeEditEmail = email;

  document.getElementById('edit-name').value     = student.name    || '';
  document.getElementById('edit-email').value    = student.email   || '';
  document.getElementById('edit-linkedin').value = student.linkedin || '';
  document.getElementById('edit-github').value   = student.github  || '';
  document.getElementById('edit-keywords').value = (student.keywords || []).join(', ');

  // Populate skills
  const skillsContainer = document.getElementById('edit-skills-list');
  skillsContainer.innerHTML = '';
  (student.skills || []).forEach((skill, idx) => {
    skillsContainer.appendChild(createSkillRow(skill.title || '', skill.description || '', idx));
  });

  document.getElementById('edit-modal').classList.remove('hidden');
}

function closeEditModal() {
  document.getElementById('edit-modal').classList.add('hidden');
}

// Create a dynamic skill row element
function createSkillRow(title, description, idx) {
  const entry = document.createElement('div');
  entry.className = 'edit-skill-entry';
  entry.dataset.idx = idx;
  entry.innerHTML = `
    <button class="edit-skill-remove" onclick="this.closest('.edit-skill-entry').remove()" title="Remove skill">&times;</button>
    <input type="text"     class="edit-input skill-title-input"       placeholder="Skill title"       value="${escapeHtml(title)}">
    <input type="text"     class="edit-input skill-desc-input"        placeholder="Short description (optional)"  value="${escapeHtml(description)}">
  `;
  return entry;
}

function addEditSkill() {
  const container = document.getElementById('edit-skills-list');
  const idx = container.children.length;
  container.appendChild(createSkillRow('', '', idx));
}

function escapeHtml(str) {
  return (str || '').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// Save edited student details back to studentsData + localStorage
function saveEditedStudent() {
  const student = studentsData.find(s => s.email === activeEditEmail);
  if (!student) return;

  student.name     = document.getElementById('edit-name').value.trim();
  const newEmail   = document.getElementById('edit-email').value.trim();
  student.linkedin = document.getElementById('edit-linkedin').value.trim();
  student.github   = document.getElementById('edit-github').value.trim();
  student.keywords = document.getElementById('edit-keywords').value
                      .split(',').map(k => k.trim()).filter(Boolean);

  // Collect skills
  const skillEntries = document.querySelectorAll('.edit-skill-entry');
  student.skills = Array.from(skillEntries).map(entry => ({
    title:       entry.querySelector('.skill-title-input').value.trim(),
    description: entry.querySelector('.skill-desc-input').value.trim(),
  })).filter(s => s.title || s.description);

  // If email changed, migrate photo key
  if (newEmail && newEmail !== activeEditEmail) {
    const photoData = localStorage.getItem(`student_photo_${activeEditEmail}`);
    const editData  = localStorage.getItem(`student_edits_${activeEditEmail}`);
    if (photoData) {
      localStorage.setItem(`student_photo_${newEmail}`, photoData);
      localStorage.removeItem(`student_photo_${activeEditEmail}`);
    }
    if (editData) {
      localStorage.removeItem(`student_edits_${activeEditEmail}`);
    }
    student.email = newEmail;
    activeEditEmail = newEmail;
  }

  // Persist edits
  const editPayload = {
    name:     student.name,
    email:    student.email,
    linkedin: student.linkedin,
    github:   student.github,
    keywords: student.keywords,
    skills:   student.skills,
  };
  localStorage.setItem(`student_edits_${student.email}`, JSON.stringify(editPayload));

  closeEditModal();
  filterData();
}

// On load: apply any saved manual edits from localStorage into studentsData
function loadManualEdits() {
  studentsData.forEach(student => {
    const saved = localStorage.getItem(`student_edits_${student.email}`);
    if (saved) {
      try {
        const edits = JSON.parse(saved);
        Object.assign(student, edits);
      } catch(e) {}
    }
  });
}

// Load manual photos from local storage into the students array
function loadManualPhotos() {
  studentsData.forEach(student => {
    const savedPhoto = localStorage.getItem(`student_photo_${student.email}`);
    if (savedPhoto) {
      student.photo_url = savedPhoto;
    }
  });
}

// Check if there are manual photos or edits and toggle the "Clear Custom Data" button visibility
function updateClearButtonVisibility() {
  const btnClear = document.getElementById('btn-clear-photos');
  if (!btnClear) return;
  
  let hasCustomData = false;
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && (k.startsWith('student_photo_') || k.startsWith('student_edits_'))) {
      hasCustomData = true;
      break;
    }
  }
  
  if (hasCustomData) {
    btnClear.classList.remove('hidden');
  } else {
    btnClear.classList.add('hidden');
  }
}

// Open the manual photo file selection dialog for a specific student
// Used by the avatar wrapper in the Interactive Directory
function triggerPhotoUpload(email) {
  activeUploadEmail = email;
  document.getElementById('manual-photo-input').click();
}

// Crop variables
let cropZoom = 1.0;
let cropRotate = 0;
let cropTranslateX = 0;
let cropTranslateY = 0;
let isDragging = false;
let startDragX = 0;
let startDragY = 0;
let cropImgDisplayWidth = 0;
let cropImgDisplayHeight = 0;

// Setup drag events for the crop preview image
function initCropDragging() {
  const img = document.getElementById('crop-preview-img');
  const viewport = document.getElementById('crop-viewport');
  if (!img || !viewport) return;
  
  img.addEventListener('mousedown', (e) => {
    isDragging = true;
    startDragX = e.clientX - cropTranslateX;
    startDragY = e.clientY - cropTranslateY;
    viewport.style.cursor = 'grabbing';
  });
  
  window.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    cropTranslateX = e.clientX - startDragX;
    cropTranslateY = e.clientY - startDragY;
    updateCropTransform();
  });
  
  window.addEventListener('mouseup', () => {
    if (isDragging) {
      isDragging = false;
      viewport.style.cursor = 'default';
    }
  });

  // Touch support for mobile devices
  img.addEventListener('touchstart', (e) => {
    if (e.touches.length === 1) {
      isDragging = true;
      startDragX = e.touches[0].clientX - cropTranslateX;
      startDragY = e.touches[0].clientY - cropTranslateY;
    }
  });

  window.addEventListener('touchmove', (e) => {
    if (!isDragging) return;
    if (e.touches.length === 1) {
      cropTranslateX = e.touches[0].clientX - startDragX;
      cropTranslateY = e.touches[0].clientY - startDragY;
      updateCropTransform();
    }
  });

  window.addEventListener('touchend', () => {
    isDragging = false;
  });
}

// Update the CSS transform of the preview image
function updateCropTransform() {
  const img = document.getElementById('crop-preview-img');
  const zoomSlider = document.getElementById('crop-zoom-slider');
  const rotateSlider = document.getElementById('crop-rotate-slider');
  if (!img || !zoomSlider || !rotateSlider) return;
  
  cropZoom = parseFloat(zoomSlider.value);
  cropRotate = parseInt(rotateSlider.value);
  
  img.style.transform = `translate(calc(-50% + ${cropTranslateX}px), calc(-50% + ${cropTranslateY}px)) scale(${cropZoom}) rotate(${cropRotate}deg)`;
}

// Rotate by 90 degrees
function rotate90() {
  const rotateSlider = document.getElementById('crop-rotate-slider');
  if (!rotateSlider) return;
  let currentVal = parseInt(rotateSlider.value);
  currentVal = (currentVal + 90) % 360;
  rotateSlider.value = currentVal;
  updateCropTransform();
}

// Reset crop translations and zoom
function resetCropTransform() {
  cropTranslateX = 0;
  cropTranslateY = 0;
  cropZoom = 1.0;
  cropRotate = 0;
  
  const zoomSlider = document.getElementById('crop-zoom-slider');
  const rotateSlider = document.getElementById('crop-rotate-slider');
  
  if (zoomSlider) {
    // Calculate the minimum zoom to cover the 200px crop circle (which is 2/3 of the 300px viewport smaller bounds)
    const displayMin = Math.min(cropImgDisplayWidth || 300, cropImgDisplayHeight || 300);
    const minZoom = 200 / displayMin;
    zoomSlider.min = minZoom.toFixed(3);
    zoomSlider.value = Math.max(1.0, minZoom).toFixed(3);
  }
  
  if (rotateSlider) rotateSlider.value = 0;
  updateCropTransform();
}

// Close the crop modal
function closeCropModal() {
  const modal = document.getElementById('crop-modal');
  if (modal) modal.classList.add('hidden');
}

// Apply crop and save
function applyCrop() {
  const img = document.getElementById('crop-preview-img');
  if (!img) return;
  
  const canvas = document.createElement('canvas');
  canvas.width = 200;
  canvas.height = 200;
  const ctx = canvas.getContext('2d');
  
  // Fill background with white (for profile picture aesthetic)
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, 200, 200);
  
  const scaleRatio = 200 / 300;
  const canvasTx = 100 + cropTranslateX * scaleRatio;
  const canvasTy = 100 + cropTranslateY * scaleRatio;
  
  ctx.translate(canvasTx, canvasTy);
  ctx.rotate((cropRotate * Math.PI) / 180);
  
  const displayToNaturalRatio = cropImgDisplayWidth / img.naturalWidth;
  const totalScale = cropZoom * displayToNaturalRatio * scaleRatio;
  
  ctx.scale(totalScale, totalScale);
  ctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);
  
  const croppedDataUrl = canvas.toDataURL('image/jpeg', 0.9);
  
  // Save base64 photo to local storage
  localStorage.setItem(`student_photo_${activeUploadEmail}`, croppedDataUrl);
  
  // Update in-memory data
  const student = studentsData.find(s => s.email === activeUploadEmail);
  if (student) {
    student.photo_url = croppedDataUrl;
  }
  
  // Refresh display
  filterData();
  updateClearButtonVisibility();
  
  // Close modal
  closeCropModal();
}

function openAddStudentModal() {
  ['add-student-name', 'add-student-email', 'add-student-stream'].forEach(id => {
    const input = document.getElementById(id);
    if (input) input.value = '';
  });
  document.getElementById('add-student-modal').classList.remove('hidden');
  document.getElementById('add-student-name').focus();
}

function closeAddStudentModal() {
  document.getElementById('add-student-modal').classList.add('hidden');
}

function saveNewStudent() {
  const name = document.getElementById('add-student-name').value.trim();
  const email = document.getElementById('add-student-email').value.trim().toLowerCase();
  const stream = document.getElementById('add-student-stream').value.trim();
  if (!name || !email) {
    showImportToast('Name and email are required.', 'error');
    return;
  }
  if (!/^\S+@\S+\.\S+$/.test(email)) {
    showImportToast('Enter a valid email address.', 'error');
    return;
  }
  if (studentsData.some(student => studentIdentity(student) === email)) {
    showImportToast('A student with this email already exists.', 'error');
    return;
  }
  const student = {
    id: studentsData.reduce((max, item) => Math.max(max, Number(item.id) || 0), 0) + 1,
    name, email, raw_stream: stream, streams: stream ? [stream] : [],
    photo_url: '', photo_id: '', linkedin: '', github: '', skills: [], keywords: [],
  };
  const manualStudents = readStoredArray(MANUAL_STUDENTS_KEY);
  manualStudents.push(student);
  localStorage.setItem(MANUAL_STUDENTS_KEY, JSON.stringify(manualStudents));
  localStorage.setItem(DELETED_STUDENTS_KEY, JSON.stringify(
    readStoredArray(DELETED_STUDENTS_KEY).filter(identity => identity !== email)
  ));
  studentsData.push(student);
  originalStudentsData.push({ ...student });
  closeAddStudentModal();
  refreshStreamFilterOptions();
  filterData();
  showImportToast(`Added ${name}. Use Edit Details to complete the profile.`, 'success');
}

function removeSearchedStudent() {
  const query = document.getElementById('search-name').value.trim();
  if (!query) {
    showImportToast('Search for the student you want to remove first.', 'error');
    return;
  }
  const student = findStudentByName(query);
  if (!student) {
    showImportToast(`No student found for "${query}".`, 'error');
    return;
  }
  if (!confirm(`Remove ${student.name} from the brochure?`)) return;
  const identity = studentIdentity(student);
  const deleted = readStoredArray(DELETED_STUDENTS_KEY);
  if (!deleted.includes(identity)) deleted.push(identity);
  localStorage.setItem(DELETED_STUDENTS_KEY, JSON.stringify(deleted));
  localStorage.setItem(MANUAL_STUDENTS_KEY, JSON.stringify(
    readStoredArray(MANUAL_STUDENTS_KEY).filter(item => studentIdentity(item) !== identity)
  ));
  localStorage.removeItem(`student_edits_${student.email}`);
  localStorage.removeItem(`student_photo_${student.email}`);
  studentsData = studentsData.filter(item => item !== student);
  originalStudentsData = originalStudentsData.filter(item => studentIdentity(item) !== identity);
  document.getElementById('search-name').value = '';
  refreshStreamFilterOptions();
  filterData();
  showImportToast(`Removed ${student.name}.`, 'success');
}

// Convert chosen photo to Base64 and trigger the crop modal
function handleManualPhotoChange(event) {
  const file = event.target.files[0];
  if (!file) return;
  
  const reader = new FileReader();
  reader.onload = function(e) {
    const dataUrl = e.target.result;
    const previewImg = document.getElementById('crop-preview-img');
    if (!previewImg) return;
    
    previewImg.onload = function() {
      const maxDisplaySize = 300;
      if (previewImg.naturalWidth > previewImg.naturalHeight) {
        cropImgDisplayHeight = maxDisplaySize;
        cropImgDisplayWidth = (previewImg.naturalWidth / previewImg.naturalHeight) * maxDisplaySize;
      } else {
        cropImgDisplayWidth = maxDisplaySize;
        cropImgDisplayHeight = (previewImg.naturalHeight / previewImg.naturalWidth) * maxDisplaySize;
      }
      
      previewImg.style.width = cropImgDisplayWidth + 'px';
      previewImg.style.height = cropImgDisplayHeight + 'px';
      
      // Reset variables and sliders
      resetCropTransform();
      
      // Show crop modal
      const modal = document.getElementById('crop-modal');
      if (modal) modal.classList.remove('hidden');
    };
    previewImg.src = dataUrl;
    
    // Reset file input value
    event.target.value = '';
  };
  reader.readAsDataURL(file);
}

// Reset all manually uploaded student photos and manual text edits
function clearAllManualEdits() {
  if (!confirm('Reset all manual edits and uploaded photos back to their original state?')) return;
  
  // Collect all keys first, then remove (avoid mutation during iteration)
  const keysToRemove = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && (k.startsWith('student_photo_') || k.startsWith('student_edits_'))) {
      keysToRemove.push(k);
    }
  }
  keysToRemove.forEach(k => localStorage.removeItem(k));
  localStorage.removeItem(MANUAL_STUDENTS_KEY);
  localStorage.removeItem(DELETED_STUDENTS_KEY);
  
  // Reload the page to ensure a clean state from students_cleaned.json
  window.location.reload();
}

// ── XLSX IMPORT ──────────────────────────────────────────────────────────────

// Convert a Google Drive share URL → direct CDN link usable as <img src>
function driveShareToDirectUrl(url) {
  if (!url || typeof url !== 'string') return '';
  // Pattern: https://drive.google.com/file/d/FILE_ID/view?...
  const m = url.match(/\/d\/([a-zA-Z0-9_-]+)/);
  if (m) return `https://lh3.googleusercontent.com/d/${m[1]}`;
  // Already a direct lh3 link
  if (url.startsWith('https://lh3')) return url;
  return url;
}

// Parse a skill cell into the short bold heading and normal-weight description.
function parseSkillCell(raw) {
  if (!raw || typeof raw !== 'string' || !raw.trim()) return null;
  const text = raw.replace(/\r/g, '').trim();
  const explicitSeparator = text.match(/\n|:\s*|\s[\u2013\u2014-]\s*/);
  if (explicitSeparator && explicitSeparator.index > 0) {
    const separatorLength = explicitSeparator[0].length;
    return {
      title: text.slice(0, explicitSeparator.index).trim(),
      description: text.slice(explicitSeparator.index + separatorLength).trim(),
    };
  }

  // Some sheets omit punctuation between the heading and description.
  // Descriptions generally begin with one of these action verbs.
  const descriptionStart = text.search(/\s(?=(?:Applied|Analyzed|Built|Created|Designed|Developed|Engineered|Implemented|Planned|Programmed|Worked|Used|Utilized|Led|Focused|Specialized|Skilled)\b)/i);
  if (descriptionStart > 0) {
    return {
      title: text.slice(0, descriptionStart).trim(),
      description: text.slice(descriptionStart).trim(),
    };
  }
  // A long delimiter-free cell is descriptive copy, not a heading.
  if (text.split(/\s+/).length > 8) {
    return { title: '', description: text };
  }
  return { title: text, description: '' };
}

function handleXLSXImport(event) {
  const file = event.target.files[0];
  if (!file) return;
  event.target.value = ''; // reset so same file can be re-imported

  const importedFileName = file.name || '';

  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      const workbook = XLSX.read(e.target.result, { type: 'array' });
      const rows = workbook.SheetNames.flatMap(sheetName => {
        const sheet = workbook.Sheets[sheetName];
        return sheet ? XLSX.utils.sheet_to_json(sheet, { defval: '', raw: false }) : [];
      });

      if (!rows.length) {
        showImportToast('⚠️ The Excel file appears to be empty.', 'error');
        return;
      }

      const targetStudents = studentsData;

      let added = 0, updated = 0, skipped = 0;
      const maxId = targetStudents.reduce((m, s) => Math.max(m, s.id || 0), 0);
      let nextId = maxId + 1;

      const importedStudents = [];
      rows.forEach(row => {
        const name = getRowValue(row, ['Full Name', 'Name', 'Student Name']);
        const email = getRowValue(row, ['Official Mail ID', 'Official Email ID', 'Email', 'Email ID']).toLowerCase();
        const stream = getRowValue(row, ['Streams', 'Stream', 'Program', 'Programme']);
        const photoRaw = getRowValue(row, ['Formal Photo', 'Photo', 'Profile Photo']);
        const linkedin = getRowValue(row, ['LinkedIn Profile Link', 'LinkedIn', 'LinkedIn Link']);
        const github = getRowValue(row, ['Github Pofile Link', 'Github Profile Link', 'GitHub', 'GitHub Link']);
        const kwRaw = getRowValue(row, ['skills only - keywords (max 6)', 'Skill Keywords', 'Keywords']);

        if (!name && !email) { skipped++; return; }

        const skills = [
          parseSkillCell(getRowValue(row, ['skill 1 with Headindg and explantion', 'skill 1 with Heading and explanation', 'Skill 1'])),
          parseSkillCell(getRowValue(row, ['skill 2 with Heading and explanation', 'Skill 2'])),
          parseSkillCell(getRowValue(row, ['skill 3 with Heading and explantion', 'skill 3 with Heading and explanation', 'Skill 3'])),
        ].filter(Boolean);

        const keywords = kwRaw
          ? kwRaw.split(/[,\n;|\u2022\u00b7]+/).map(k => k.trim()).filter(Boolean)
          : [];

        const photoUrl = driveShareToDirectUrl(photoRaw);
        const photoId  = photoRaw.match(/\/d\/([a-zA-Z0-9_-]+)/)?.[1] || '';
        importedStudents.push({ name, email, raw_stream: stream, streams: stream ? [stream] : [], photo_url: photoUrl, photo_id: photoId, linkedin, github, skills, keywords });

        // Check if student already exists (match by email)
        const existing = targetStudents.find(s => s.email === email);
        if (existing) {
          // Merge: update fields that are non-empty in the new sheet
          if (name)     existing.name     = name;
          if (stream) {
            existing.raw_stream = stream;
            existing.streams = [stream];
          }
          if (photoUrl) existing.photo_url = photoUrl;
          if (linkedin) existing.linkedin  = linkedin;
          if (github)   existing.github    = github;
          if (skills.length)   existing.skills   = skills;
          if (keywords.length) existing.keywords = keywords;
          updated++;
        } else {
          targetStudents.push({
            id: nextId++,
            name, email,
            raw_stream: stream,
            streams: stream ? [stream] : [],
            photo_url: photoUrl,
            photo_id: photoId,
            linkedin, github, skills, keywords,
          });
          added++;
        }
      });

      restoreImportedStudentDeletions(importedStudents);

      // Rebuild baseline for future photo resets
      originalStudentsData = studentsData.map(s => {
        const copy = { ...s };
        // Avoid baking custom base64 photos into the baseline
        if (localStorage.getItem(`student_photo_${s.email}`) && copy.photo_url && copy.photo_url.startsWith('data:image')) {
          const prevOrig = originalStudentsData.find(o => o.id === s.id);
          copy.photo_url = prevOrig ? (prevOrig.photo_url || '') : '';
        }
        return copy;
      });
      const importedFile = {
        id: `${Date.now()}_${Math.random().toString(36).slice(2)}`,
        name: importedFileName || `Import ${importedFiles.length + 1}`,
        students: importedStudents,
      };
      const previousFileIndex = importedFiles.findIndex(item =>
        item.name.toLowerCase() === importedFile.name.toLowerCase()
      );
      if (previousFileIndex >= 0) importedFiles.splice(previousFileIndex, 1, importedFile);
      else importedFiles.push(importedFile);
      saveImportedFiles();
      // Rebuild from the saved source files so replacing a workbook also
      // removes people/values that no longer exist in its latest version.
      rebuildStudentsFromImports();
      showImportToast(`✅ Import complete: ${added} added, ${updated} updated, ${skipped} skipped.`, 'success');

    } catch(err) {
      console.error('XLSX import error:', err);
      showImportToast('❌ Failed to read the Excel file. Make sure it is a valid .xlsx file.', 'error');
    }
  };
  reader.readAsArrayBuffer(file);
}

// Show a temporary toast notification
function showImportToast(message, type = 'success') {
  let toast = document.getElementById('import-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'import-toast';
    toast.style.cssText = `
      position: fixed; top: 1.5rem; left: 50%; transform: translateX(-50%) translateY(-80px);
      background: ${type === 'success' ? '#064028' : '#7f1d1d'};
      color: white; padding: 0.75rem 1.5rem; border-radius: 10px;
      font-family: var(--font-body); font-size: 0.875rem; font-weight: 500;
      box-shadow: 0 10px 30px rgba(0,0,0,0.25); z-index: 9999;
      transition: transform 0.35s cubic-bezier(0.16,1,0.3,1), opacity 0.35s;
      opacity: 0; max-width: 90vw; text-align: center;
    `;
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.style.background = type === 'success' ? '#064028' : '#7f1d1d';
  // Slide in
  requestAnimationFrame(() => {
    toast.style.transform = 'translateX(-50%) translateY(0)';
    toast.style.opacity = '1';
  });
  // Slide out after 4 seconds
  clearTimeout(toast._timeout);
  toast._timeout = setTimeout(() => {
    toast.style.transform = 'translateX(-50%) translateY(-80px)';
    toast.style.opacity = '0';
  }, 4000);
}

// On document load, start with imported XLSX data only.
document.addEventListener('DOMContentLoaded', () => {
  loadBrochurePalette();
  baseStudentsData = [];
  const frontPageNameInput = document.getElementById('front-page-name');
  if (frontPageNameInput) {
    frontPageNameInput.value = localStorage.getItem(FRONT_PAGE_NAME_KEY) || '';
  }
  try {
    const savedImports = JSON.parse(localStorage.getItem(IMPORTED_FILES_KEY) || '[]');
    importedFiles = Array.isArray(savedImports) ? savedImports : [];
  } catch (error) {
    importedFiles = [];
  }
  rebuildStudentsFromImports();
  updateClearButtonVisibility();
  initCropDragging();
});

// Switch view between interactive directory and A4 print brochure
function switchView(view) {
  currentView = view;
  const dirView = document.getElementById('directory-view');
  const printView = document.getElementById('print-view');
  const btnDir = document.getElementById('btn-directory-view');
  const btnPrint = document.getElementById('btn-print-view');

  if (view === 'directory') {
    dirView.classList.remove('hidden');
    printView.classList.add('hidden');
    btnDir.classList.add('active');
    if (btnPrint) btnPrint.classList.remove('active');
  } else {
    dirView.classList.add('hidden');
    printView.classList.remove('hidden');
    btnDir.classList.remove('active');
    if (btnPrint) btnPrint.classList.add('active');
  }
}

const INLINE_TEXT_SELECTOR = [
  '.cover-header > div', '.cover-badge', '.orange-text', '.cover-desc',
  '.prepared-for-label', '.prepared-for-val', '.profile-header-title span',
  '.student-name', '.email-label', '.email-val', '.skill-row-title',
  '.skill-row-desc', '.exp-title', '.exp-link', '.card-keyword-pill', '.footer-text'
].join(',');

function applyInlineTextEditing() {
  const preview = document.getElementById('print-view');
  if (!preview) return;
  preview.classList.toggle('inline-text-editing', inlineTextEditing);
  preview.querySelectorAll(INLINE_TEXT_SELECTOR).forEach(element => {
    if (inlineTextEditing) {
      element.setAttribute('contenteditable', 'plaintext-only');
      element.setAttribute('spellcheck', 'true');
      if (element.tagName === 'A') element.onclick = event => event.preventDefault();
    } else {
      element.removeAttribute('contenteditable');
      element.removeAttribute('spellcheck');
      if (element.tagName === 'A') element.onclick = null;
    }
  });
}

function toggleInlineTextEditing() {
  inlineTextEditing = !inlineTextEditing;
  if (inlineTextEditing && currentView !== 'print') switchView('print');
  applyInlineTextEditing();
  const button = document.getElementById('btn-edit-text');
  if (button) {
    button.classList.toggle('active', inlineTextEditing);
    button.textContent = inlineTextEditing ? 'Finish Editing' : 'Edit Text';
  }
  showImportToast(
    inlineTextEditing
      ? 'Text editing is on. Click any highlighted text and type your replacement.'
      : 'Text editing finished. You can now save the brochure as PDF.',
    'success'
  );
}

// Trigger PDF print dialog
function exportToPDF() {
  // If we are currently in directory view, switch to print view first
  // so that the printable structure is loaded in the DOM
  const initialView = currentView;
  if (initialView !== 'print') {
    switchView('print');
    // Allow DOM to adjust before printing
    setTimeout(() => {
      window.print();
      // Restore view if desired
      switchView(initialView);
    }, 150);
  } else {
    window.print();
  }
}

// Helper to extract student initials
function getInitials(name) {
  if (!name) return "SP";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// Global function to handle broken student profile images dynamically
function handleImageError(img, initials) {
  const placeholder = document.createElement('div');
  placeholder.className = img.className.replace('web-avatar', 'web-avatar-placeholder').replace('avatar-circle', 'avatar-placeholder-circle');
  placeholder.textContent = initials;
  img.parentNode.replaceChild(placeholder, img);
}

// Render the interactive directory (web layout)
function renderDirectory(students) {
  const container = document.getElementById('directory-view');
  container.innerHTML = `
    <div class="directory-intro">
      <div class="directory-title-row">
        <span class="directory-title-rule"></span>
        <h2>Student Profiles</h2>
      </div>
      <div class="directory-summary">
        <strong>${students.length} ${students.length === 1 ? 'match' : 'matches'} found</strong>
        <span>Refined by current workspace filters</span>
      </div>
    </div>
  `;

  if (students.length === 0) {
    container.insertAdjacentHTML('beforeend', `
      <div class="empty-state">
        <h3>No students found</h3>
        <p>Try adjusting your search query or stream filter.</p>
      </div>
    `);
    return;
  }

  students.forEach(student => {
    // Generate skill items
    let skillsHtml = '';
    student.skills.forEach(skill => {
      if (skill.title || skill.description) {
        skillsHtml += `
          <div class="web-skill-item">
            ${skill.title ? `<span class="web-skill-title">${skill.title}</span>` : ''}
            ${skill.description ? `<span class="web-skill-desc">${skill.description}</span>` : ''}
          </div>
        `;
      }
    });

    let linksHtml = '';
    if (student.linkedin || student.github) {
      linksHtml += `<span class="web-exp-label">Links</span>`;
      if (student.linkedin) {
        linksHtml += `<a href="${student.linkedin}" target="_blank" class="web-link" title="${student.linkedin}">
          <svg width="12" height="12" fill="currentColor" viewBox="0 0 24 24"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>
          ${student.linkedin}
        </a>`;
      }
      if (student.github) {
        linksHtml += `<a href="${student.github}" target="_blank" class="web-link" title="${student.github}">
          <svg width="12" height="12" fill="currentColor" viewBox="0 0 24 24"><path d="M12 0C5.374 0 0 5.373 0 12c0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.509 11.509 0 0112 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576C20.566 21.797 24 17.3 24 12c0-6.627-5.373-12-12-12z"/></svg>
          ${student.github}
        </a>`;
      }
    }

    // Generate keyword pills
    let keywordsHtml = '';
    student.keywords.forEach(keyword => {
      keywordsHtml += `<span class="keyword-pill">${keyword}</span>`;
    });

    const card = document.createElement('div');
    card.className = 'web-student-card';
    
    // Check photo
    const initials = getInitials(student.name);
    const photoImgHtml = student.photo_url 
      ? `<img class="web-avatar" src="${student.photo_url}" alt="${student.name}" onerror="handleImageError(this, '${initials}')">`
      : `<div class="web-avatar-placeholder">${initials}</div>`;
      
    const overlayHtml = `
      <div class="web-avatar-overlay">
        <svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z"></path><path stroke-linecap="round" stroke-linejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0zM18.75 10.5h.008v.008h-.008V10.5z"></path></svg>
      </div>
    `;

    const photoButtonText = student.photo_url ? 'Adjust Photo' : 'Add Photo';

    card.innerHTML = `
      <div class="web-card-header">
        <div class="web-avatar-wrapper" onclick="triggerPhotoUpload('${student.email}')" title="Click to upload/change photo">
          ${photoImgHtml}
          ${overlayHtml}
        </div>
        <div class="web-header-text">
          <h2 class="web-name" title="${student.name}">${student.name}</h2>
          <span class="web-stream-badge">${student.raw_stream}</span>
          ${student.email ? `<a href="mailto:${student.email}" class="web-email">${student.email}</a>` : ''}
          <div style="display:flex; gap:5px; margin-top:6px; flex-wrap:wrap;">
            <button class="edit-card-btn" onclick="triggerPhotoUpload('${student.email}')">
              <svg width="10" height="10" fill="currentColor" viewBox="0 0 24 24"><path d="M4 4h3l2-3h6l2 3h3c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2zm8 3c-2.76 0-5 2.24-5 5s2.24 5 5 5 5-2.24 5-5-2.24-5-5-5zm0 2c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3z"/></svg>
              ${photoButtonText}
            </button>
            <button class="edit-card-btn" onclick="openEditModal('${student.email}')">
              <svg width="10" height="10" fill="currentColor" viewBox="0 0 24 24"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>
              Edit Details
            </button>
          </div>
        </div>
      </div>
      <div class="web-card-body">
        <div class="web-skills-details">
          ${skillsHtml}
        </div>
        ${linksHtml ? `<div class="web-experience-links">${linksHtml}</div>` : ''}
        ${keywordsHtml ? `<div class="web-keywords-pills">${keywordsHtml}</div>` : ''}
      </div>
    `;
    container.appendChild(card);
  });
}

// Render the print brochure (A4 pagination layout)
function renderPrintPreview(students) {
  const container = document.getElementById('print-view');
  container.innerHTML = '';

  if (students.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <h3>No students to display in brochure</h3>
        <p>Please clear filters to see the full brochure.</p>
      </div>
    `;
    return;
  }

  // Define total cover count & stream description based on students filtered
  const count = students.length;
  let coverStreamTitle = "All Streams";
  let coverDesc = `${count} graduating specialists in artificial intelligence, internet of things, and embedded systems — ready to contribute from day one.`;
  
  const streamSelect = document.getElementById('filter-stream').value;
  if (streamSelect === "IOT and Embedded Systems") {
    coverStreamTitle = "IoT & Embedded Systems";
    coverDesc = `${count} graduating specialists in Internet of Things, embedded firmware, and hardware prototyping — ready to contribute from day one.`;
  } else if (streamSelect === "AI and Data Analytics") {
    coverStreamTitle = "AI & Data Analytics";
    coverDesc = `${count} graduating specialists in machine learning, data science, and applied analytics — ready to contribute from day one.`;
  }

  const visibleStreams = [...new Set(students.flatMap(getStudentStreams))];
  if (streamSelect === 'all' && visibleStreams.length === 1) {
    coverStreamTitle = visibleStreams[0];
  }
  if (streamSelect !== 'all' &&
      streamSelect !== 'IOT and Embedded Systems' &&
      streamSelect !== 'AI and Data Analytics') {
    coverStreamTitle = streamSelect;
  }
  const manualFrontPageName = document.getElementById('front-page-name')?.value.trim();
  if (manualFrontPageName) coverStreamTitle = manualFrontPageName;

  // 1. PAGE 1: COVER PAGE
  const coverPage = document.createElement('div');
  coverPage.className = 'a4-page cover-page';
  coverPage.innerHTML = `
    <div class="cover-header">
      <div class="cell-name">makeBRO &middot; BROCHURE BUILDER</div>
      <div>2026</div>
    </div>
    
    <div class="cover-content">
      <div class="badge-wrapper">
        <span class="cover-badge">Recruitment Brochure</span>
      </div>
      <h1 class="cover-title">
        Meet our<br>
        <span class="orange-text">${escapeHtml(coverStreamTitle)}</span><br>
        talent.
      </h1>
      <p class="cover-desc">${coverDesc}</p>
    </div>
    
    <div class="cover-footer">
      <div class="prepared-for-label">Prepared for</div>
      <div class="prepared-for-val">Prospective Recruiting Partners</div>
    </div>
  `;
  container.appendChild(coverPage);

  // 2. PAGE 2+: PROFILE PAGES (4 students per page)
  const studentsPerPage = 4;
  const pageCount = Math.ceil(students.length / studentsPerPage);

  for (let p = 0; p < pageCount; p++) {
    const pageStudents = students.slice(p * studentsPerPage, (p + 1) * studentsPerPage);
    
    const profilePage = document.createElement('div');
    profilePage.className = 'a4-page profile-page';
    
    // Page header details
    const pageNumStr = String(p + 1).padStart(2, '0');
    const totalPageStr = String(pageCount).padStart(2, '0');

    // Generate student cards
    let cardsHtml = '';
    pageStudents.forEach(student => {
      // Skill details
      let skillsHtml = '';
      student.skills.forEach(skill => {
        if (skill.title || skill.description) {
          skillsHtml += `
            <div class="skill-row">
              ${skill.title ? `<span class="skill-row-title">${skill.title}</span>` : ''}
              ${skill.description ? `<span class="skill-row-desc">${skill.description}</span>` : ''}
            </div>
          `;
        }
      });

      // Experience links
      let experienceHtml = '';
      if (student.linkedin || student.github) {
        experienceHtml += `<span class="exp-title">Experience</span>`;
        if (student.linkedin) {
          experienceHtml += `<a href="${student.linkedin}" target="_blank" class="exp-link">${student.linkedin}</a>`;
        }
        if (student.github) {
          experienceHtml += `<a href="${student.github}" target="_blank" class="exp-link">${student.github}</a>`;
        }
      }

      // Keyword pills
      let keywordsHtml = '';
      student.keywords.forEach(kw => {
        keywordsHtml += `<span class="card-keyword-pill">${kw}</span>`;
      });

      // Photo
      const initials = getInitials(student.name);
      const photoHtml = student.photo_url
        ? `<img class="avatar-circle" src="${student.photo_url}" alt="${student.name}" onerror="handleImageError(this, '${initials}')">`
        : `<div class="avatar-placeholder-circle">${initials}</div>`;

      const printOverlayHtml = `
        <div class="print-avatar-overlay no-print">
          <svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z"></path><path stroke-linecap="round" stroke-linejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0zM18.75 10.5h.008v.008h-.008V10.5z"></path></svg>
        </div>
      `;

      cardsHtml += `
        <div class="student-card">
          <div class="card-left">
            <div class="print-avatar-wrapper" onclick="triggerPhotoUpload('${student.email}')" title="Click to upload/change photo manually">
              ${photoHtml}
              ${printOverlayHtml}
            </div>
            <h3 class="student-name">${student.name}</h3>
            <span class="email-label">Email</span>
            <span class="email-val">${student.email}</span>
          </div>
          <div class="card-right">
            <div class="skills-section">
              ${skillsHtml}
            </div>
            ${experienceHtml ? `<div class="experience-section">${experienceHtml}</div>` : ''}
            ${keywordsHtml ? `<div class="keywords-section">${keywordsHtml}</div>` : ''}
          </div>
        </div>
      `;
    });

    profilePage.innerHTML = `
      <div class="profile-page-header">
        <div class="profile-header-title">
          <div class="dot"></div>
          <span>STUDENT PROFILES</span>
        </div>
        <div class="page-number-indicator">${pageNumStr} / ${totalPageStr}</div>
      </div>
      
      <div class="profile-cards-container">
        ${cardsHtml}
      </div>
      
      <div class="profile-page-footer">
        <span class="footer-text">makeBRO RECRUITMENT BROCHURE</span>
      </div>
    `;
    container.appendChild(profilePage);
  }
  if (inlineTextEditing) applyInlineTextEditing();
}

// Perform both rendering pipelines
function renderAll(students) {
  renderDirectory(students);
  renderPrintPreview(students);
}

// Filter student array based on UI search/filter terms
function filterData() {
  const nameQuery = document.getElementById('search-name').value.toLowerCase().trim();
  const streamValue = document.getElementById('filter-stream').value;
  const skillQuery = document.getElementById('search-skill').value.toLowerCase().trim();

  const filtered = studentsData.filter(student => {
    // 1. Name match
    const nameMatch = (student.name || '').toLowerCase().includes(nameQuery);
    
    // 2. Stream match
    let streamMatch = false;
    if (streamValue === 'all') {
      streamMatch = true;
    } else {
      // Check if current stream matches or is included in the student's streams array
      streamMatch = getStudentStreams(student).some(s => s.toLowerCase().includes(streamValue.toLowerCase()));
    }
    
    // 3. Skills/Keywords match
    let skillMatch = true;
    if (skillQuery) {
      const keywordMatch = (student.keywords || []).some(kw => kw.toLowerCase().includes(skillQuery));
      const detailedSkillMatch = (student.skills || []).some(s =>
        (s.title && s.title.toLowerCase().includes(skillQuery)) || 
        (s.description && s.description.toLowerCase().includes(skillQuery))
      );
      skillMatch = keywordMatch || detailedSkillMatch;
    }

    return nameMatch && streamMatch && skillMatch;
  });

  renderAll(filtered);
}
