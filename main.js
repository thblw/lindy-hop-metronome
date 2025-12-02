// ============================================================================
// SYNCOPATION METRONOME - MAIN APPLICATION
// ============================================================================

// State
const state = {
    mode: '8',
    pattern: [],
    tempo: 140,
    swingMode: 'light',
    basePulseOn: true,
    isPlaying: false,
    currentBeat: -1,
    nextNoteTime: 0
};

// Swing ratios (long:short)
const swingRatios = {
    light: 1.3,
    medium: 1.5,
    hard: 2.0
};

// Pattern presets
const presets = {
    basic8: {
        mode: '8',
        name: 'Basic 8-Count',
        tempo: 60,
        accents: [false, true, false, true, false, true, true, true, false, true, false, true, false, true, true, true]
        // Sequence shifted one box: a, 1, a, 2, a, 3, a, 4, a, 5, a, 6, a, 7, a, 8
        // Accented: a, 1, 2, 3, &, 4, 5, 6, 7, &, 8
        // Positions: 0, 1, 3, 5, 6, 7, 8, 10, 12, 13, 14, 15
    },
    basic6: {
        mode: '6',
        name: 'Basic 6-Count',
        tempo: 60,
        accents: [false, true, false, true, false, true, true, true, false, true, true, true]
        // Sequence shifted one box: a, 1, a, 2, a, 3, a, 4, a, 5, a, 6
        // Accented: a, 1, 2, 3, &, 4, 5, &, 6
        // Positions: 0, 1, 3, 5, 6, 7, 8, 9, 10, 11
    },
    basicCharleston: {
        mode: '8',
        name: 'Basic Charleston',
        tempo: 80,
        accents: [false, true, false, true, false, true, false, false, false, true, false, false, false, true, false, false]
        // Charleston pattern: boxes 1, 3, 5, 7, 9, 13
    }
};

// Audio context
let audioContext;
let oscillatorNodes = [];
let schedulerID;
const SCHEDULE_AHEAD_TIME = 0.1; // 100ms
const LOOK_AHEAD_TIME = 0.025; // 25ms

// ============================================================================
// INITIALIZATION
// ============================================================================

function init() {
    // Create audio context
    audioContext = new (window.AudioContext || window.webkitAudioContext)();

    // Initialize pattern
    initializePattern();

    // Set up event listeners
    setupEventListeners();

    // Start scheduler
    startScheduler();
}

function initializePattern() {
    const count = state.mode === '8' ? 16 : 12;
    state.pattern = new Array(count).fill(false);
    state.pattern[1] = true; // Always accent the 1
    state.tempo = 60; // Default 120 BPM (60 * 2)
    document.getElementById('tempoBPM').textContent = '120 BPM';
    renderGrid();
}

function setupEventListeners() {
    // Transport
    document.getElementById('playBtn').addEventListener('click', () => {
        if (audioContext.state === 'suspended') {
            audioContext.resume();
        }
        state.isPlaying = true;
        state.nextNoteTime = audioContext.currentTime;
        updateTransportUI();
    });

    document.getElementById('stopBtn').addEventListener('click', () => {
        state.isPlaying = false;
        state.currentBeat = -1;
        updateTransportUI();
        clearGridHighlight();
        // Reset next note time for next play
        state.nextNoteTime = audioContext.currentTime;
    });

    // Tempo
    document.getElementById('tempoSlider').addEventListener('input', (e) => {
        state.tempo = parseInt(e.target.value);
        const actualBPM = state.tempo * 2;
        document.getElementById('tempoBPM').textContent = actualBPM + ' BPM';
    });

    // Mode toggle
    document.querySelectorAll('[data-mode]').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('[data-mode]').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            const newMode = e.target.dataset.mode;
            // Preserve pattern when switching modes
            const oldPattern = [...state.pattern];
            state.mode = newMode;
            // Re-initialize with new pattern size but preserve selected boxes
            const count = state.mode === '8' ? 16 : 12;
            state.pattern = new Array(count).fill(false);
            // Copy over existing selections
            for (let i = 0; i < Math.min(oldPattern.length, count); i++) {
                state.pattern[i] = oldPattern[i];
            }
            renderGrid();
        });
    });

    // Swing toggle
    document.querySelectorAll('[data-swing]').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('[data-swing]').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            state.swingMode = e.target.dataset.swing;
        });
    });

    // Base Pulse toggle
    document.querySelectorAll('[data-pulse]').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('[data-pulse]').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            state.basePulseOn = e.target.dataset.pulse === 'on';
        });
    });

    // Grid clicks
    document.getElementById('patternGrid').addEventListener('click', (e) => {
        const item = e.target.closest('.grid-item');
        if (item) {
            const index = parseInt(item.dataset.index);
            state.pattern[index] = !state.pattern[index];
            renderGrid();
        }
    });

    // Presets
    document.getElementById('presetSelect').addEventListener('change', (e) => {
        if (e.target.value && presets[e.target.value]) {
            const preset = presets[e.target.value];
            state.mode = preset.mode;
            state.pattern = [...preset.accents];

            // Update tempo if preset specifies it
            if (preset.tempo !== undefined) {
                state.tempo = preset.tempo;
                const actualBPM = state.tempo * 2;
                document.getElementById('tempoBPM').textContent = actualBPM + ' BPM';
                document.getElementById('tempoSlider').value = state.tempo;
            }

            // Update mode buttons
            document.querySelectorAll('[data-mode]').forEach(btn => {
                btn.classList.toggle('active', btn.dataset.mode === preset.mode);
            });

            renderGrid();
            // Keep preset selected and display name
            e.target.options[e.target.selectedIndex].text = presets[e.target.value].name || e.target.options[e.target.selectedIndex].text;
        }
    });

    // Randomize
    document.getElementById('randomizeBtn').addEventListener('click', randomizePattern);

    // Clear
    document.getElementById('clearBtn').addEventListener('click', () => {
        state.pattern.fill(false);
        state.pattern[1] = true; // Keep the 1 accented
        renderGrid();
    });
}

// ============================================================================
// GRID RENDERING
// ============================================================================

function renderGrid() {
    const grid = document.getElementById('patternGrid');
    grid.innerHTML = '';
    grid.className = state.mode === '6' ? 'pattern-grid mode-6' : 'pattern-grid';

    const labels = state.mode === '8'
        ? ['a', '1', 'a', '2', 'a', '3', 'a', '4', 'a', '5', 'a', '6', 'a', '7', 'a', '8']
        : ['a', '1', 'a', '2', 'a', '3', 'a', '4', 'a', '5', 'a', '6'];

    state.pattern.forEach((isAccent, index) => {
        const item = document.createElement('div');
        item.className = 'grid-item' + (isAccent ? ' accent' : '');
        item.dataset.index = index;
        item.innerHTML = `<div class="grid-label">${labels[index]}</div>`;
        grid.appendChild(item);
    });
}

// ============================================================================
// PATTERN RANDOMIZATION
// ============================================================================

function randomizePattern() {
    const count = state.pattern.length;
    // Randomize but ensure at least 3 accents and always keep beat 1
    state.pattern[1] = true; // Always beat 1
    let accentCount = 1;

    for (let i = 1; i < count; i++) {
        // Bias towards some accents (40% chance)
        state.pattern[i] = Math.random() < 0.4;
        if (state.pattern[i]) accentCount++;
    }

    // If too few accents, add a couple more
    if (accentCount < 3) {
        for (let i = 1; i < count; i++) {
            if (!state.pattern[i] && Math.random() < 0.5) {
                state.pattern[i] = true;
            }
        }
    }

    renderGrid();
}

// ============================================================================
// AUDIO SCHEDULING
// ============================================================================

function startScheduler() {
    function scheduleNotes() {
        if (!state.isPlaying) {
            schedulerID = setTimeout(scheduleNotes, LOOK_AHEAD_TIME * 1000);
            return;
        }
        // Schedule all notes that fall within the lookahead window
        while (state.nextNoteTime < audioContext.currentTime + SCHEDULE_AHEAD_TIME) {
            scheduleNote(state.nextNoteTime);
            advanceNote();
        }
        schedulerID = setTimeout(scheduleNotes, LOOK_AHEAD_TIME * 1000);
    }
    scheduleNotes();
}

function scheduleNote(time) {
    if (!state.isPlaying) return;

    // Initialize currentBeat if needed
    if (state.currentBeat < 0) {
        state.currentBeat = 0;
    }

    const beatDuration = (30 / state.tempo) * (1 / 4); // quarter note = 1/4 of a beat (doubled tempo)
    const beatInPattern = state.currentBeat % state.pattern.length;
    const isDownbeat = beatInPattern % 2 === 1; // 1,2,3,4,5,6,7,8 are at odd indices (after 'a')
    const isOffBeat = !isDownbeat;
    const hasUserAccent = state.pattern[beatInPattern];

    // Determine what to play
    let shouldPlayClick = false;
    let shouldBeAccent = false;

    if (hasUserAccent) {
        // User has marked this position as accented in the syncopation pattern
        shouldPlayClick = true;
        shouldBeAccent = true;
    } else if (isDownbeat && state.basePulseOn) {
        // Base pulse on downbeat (only if not already accented by user)
        shouldPlayClick = true;
        shouldBeAccent = false;
    }

    if (shouldPlayClick) {
        // Calculate actual time with swing (only for off-beats)
        let scheduleTime = time;
        if (isOffBeat) {
            const swingRatio = swingRatios[state.swingMode];
            // For swing, delay the off-beat based on swing ratio
            const swingDelay = ((swingRatio - 1) / (swingRatio + 1)) * beatDuration * 2;
            scheduleTime = time + swingDelay;
        }

        playClick(scheduleTime, shouldBeAccent);
    }

    // Update UI immediately for visual feedback
    updateGridHighlight();
    // Update current beat for next iteration
    state.currentBeat++;
}

function advanceNote() {
    const beatDuration = (60 / state.tempo) / 4;
    state.nextNoteTime += beatDuration;
}

function stopScheduler() {
    if (schedulerID) {
        clearTimeout(schedulerID);
    }
}

function playClick(time, isAccent) {
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    // Frequency: accent is higher pitch
    oscillator.frequency.value = isAccent ? 1000 : 600;

    // Duration: short click
    const duration = isAccent ? 0.1 : 0.06;
    gainNode.gain.setValueAtTime(0.3, time);
    gainNode.gain.exponentialRampToValueAtTime(0.01, time + duration);

    oscillator.start(time);
    oscillator.stop(time + duration);
}

function updateGridHighlight() {
    const beatInPattern = state.currentBeat % state.pattern.length;
    const items = document.querySelectorAll('.grid-item');
    items.forEach((item, index) => {
        item.classList.toggle('playing', index === beatInPattern);
    });
    const teachingItems = document.querySelectorAll('.teaching-grid-item');
    teachingItems.forEach((item, index) => {
        item.classList.toggle('playing', index === beatInPattern);
    });
}

function clearGridHighlight() {
    document.querySelectorAll('.grid-item').forEach(item => {
        item.classList.remove('playing');
    });
}

function updateTransportUI() {
    const playBtn = document.getElementById('playBtn');
    const stopBtn = document.getElementById('stopBtn');
    playBtn.disabled = state.isPlaying;
    stopBtn.disabled = !state.isPlaying;
}

// ============================================================================
// TEACHING MODE
// ============================================================================

function renderTeachingGrid() {
    const grid = document.getElementById('teachingGrid');
    grid.innerHTML = '';
    grid.className = state.mode === '6' ? 'teaching-modal-grid mode-6' : 'teaching-modal-grid';

    const labels = state.mode === '8'
        ? ['a', '1', 'a', '2', 'a', '3', 'a', '4', 'a', '5', 'a', '6', 'a', '7', 'a', '8']
        : ['a', '1', 'a', '2', 'a', '3', 'a', '4', 'a', '5', 'a', '6'];

    state.pattern.forEach((isAccent, index) => {
        const item = document.createElement('div');
        item.className = 'teaching-grid-item' + (isAccent ? ' accent' : '');
        item.dataset.index = index;
        item.textContent = labels[index];
        item.addEventListener('click', () => {
            state.pattern[index] = !state.pattern[index];
            renderTeachingGrid();
            renderGrid();
        });
        grid.appendChild(item);
    });
}

function toggleTeachingMode() {
    const modal = document.getElementById('teachingModal');
    modal.classList.toggle('active');
    if (modal.classList.contains('active')) {
        renderTeachingGrid();
    }
}

// ============================================================================
// START APPLICATION
// ============================================================================

window.addEventListener('DOMContentLoaded', () => {
    init();

    document.getElementById('teachingModeBtn').addEventListener('click', toggleTeachingMode);
    document.getElementById('teachingCloseBtn').addEventListener('click', toggleTeachingMode);

    // Teaching mode play/stop buttons
    document.getElementById('teachingPlayBtn').addEventListener('click', () => {
        if (audioContext.state === 'suspended') {
            audioContext.resume();
        }
        state.isPlaying = true;
        state.nextNoteTime = audioContext.currentTime;
        updateTeachingTransportUI();
    });

    document.getElementById('teachingStopBtn').addEventListener('click', () => {
        state.isPlaying = false;
        state.currentBeat = -1;
        updateTeachingTransportUI();
        clearGridHighlight();
        state.nextNoteTime = audioContext.currentTime;
    });
});

function updateTeachingTransportUI() {
    const playBtn = document.getElementById('teachingPlayBtn');
    const stopBtn = document.getElementById('teachingStopBtn');
    playBtn.disabled = state.isPlaying;
    stopBtn.disabled = !state.isPlaying;
}