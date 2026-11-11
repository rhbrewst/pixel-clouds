(function (root) {
  'use strict';
  const M = typeof module !== 'undefined' && module.exports ? require('./model.js') : root.PixelCloudModel;
  // Bundled content is used only when this browser has no saved presentation.
  // Keep the copy separate from the motion engine and user-created slides.
  const slides = [
    {
      name: 'Rethink AI', label: '', heading: 'Rethink AI',
      body: 'Unlock the unique value in AI assisted digital project development.', source: 'Ross Brewster',
      space: { x: 50, y: 50, width: 80, height: 62, rotation: 0 }
    },
    {
      name: 'The opposition', label: 'THE OPPOSITION', heading: 'Is AI Making Us Think Less?',
      body: '• Academic dishonesty\n• Cognitive dependence\n• Loss of critical thinking',
      source: 'Bastani et al. (2025), PNAS; UNESCO (2023)',
      space: { x: 44, y: 50, width: 80, height: 82, rotation: 0 }
    },
    {
      name: 'The counterargument', label: 'THE COUNTERARGUMENT', heading: 'Using AI ≠ Creating With AI',
      body: "Don't outsource your thinking. Outsource the barriers.",
      source: 'Y Combinator (2025); UNESCO (2023)',
      space: { x: 56, y: 49, width: 80, height: 76, rotation: 0 }
    },
    {
      name: 'The proof', label: 'THE PROOF', heading: 'This Presentation Was Built With AI',
      body: 'Not PowerPoint. Not Google Slides.\n\nCode. Creativity. Collaboration.',
      source: 'Peng et al. (2023), The Impact of AI on Developer Productivity',
      space: { x: 50, y: 51, width: 86, height: 86, rotation: 0 }
    },
    {
      name: 'Entrepreneurship', label: 'ENTREPRENEURSHIP', heading: 'Idea to Income',
      body: 'Idea → Prototype → Product → Customer\n\nAI lowers the cost of getting started.',
      source: 'Karpathy (2025), Software Is Changing (Again)',
      space: { x: 46, y: 49, width: 84, height: 80, rotation: 0 }
    },
    {
      name: 'Personal example', label: 'PERSONAL EXAMPLE', heading: 'My Tutoring Website',
      body: 'A website for my own tutoring services.\n\nBuilt with AI-assisted coding.\n\nHelping me find students and earn money tutoring.', source: '', qr: 'accytutor',
      space: { x: 54, y: 50, width: 82, height: 88, rotation: 0 }
    },
    {
      name: 'Broader applications', label: 'BROADER APPLICATIONS', heading: "You Don't Need to Start a Business",
      body: '• Build your own study tools.\n• Automate repetitive tasks.\n• Create interactive portfolios.\n• Turn data into useful dashboards.\n\nSolve a problem that matters to you.', source: '',
      space: { x: 46, y: 50, width: 86, height: 90, rotation: 0 }
    },
    {
      name: 'The challenge', label: 'THE CHALLENGE', heading: 'Your First 30 Minutes',
      body: "1. Identify a problem.\n2. Describe your idea to an AI coding assistant.\n3. Build, test, and improve your first prototype.\n\nYou don't need to know how to code to start learning.", source: '',
      space: { x: 54, y: 50, width: 86, height: 90, rotation: 0 }
    },
    {
      name: 'The call to action', label: 'THE CALL TO ACTION', heading: 'Stop Just Using AI. Start Building.',
      body: "The question is not what AI can do for you.\n\nIt's what can you do *with* AI.", source: '',
      space: { x: 50, y: 50, width: 86, height: 88, rotation: 0 }
    }
  ];
  function createProject() {
    const project = { version: 2, title: 'Rethink AI', slides: slides.map((slide, i) => ({
      id: 'rethink-ai-' + (i + 1), name: slide.name, space: M.clone(slide.space),
      content: { label: slide.label, heading: slide.heading, body: slide.body, source: slide.source, ...(slide.qr ? { qr: slide.qr } : {}) }
    })), transitions: [] };
    M.reconcileTransitions(project);
    return project;
  }
  const api = { createProject };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PixelCloudStarter = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
