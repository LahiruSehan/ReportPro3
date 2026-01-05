
// Pure JavaScript entry point
document.addEventListener('DOMContentLoaded', () => {
  console.log('Hello World app initialized successfully using pure standards.');
  
  // Subtle parallax effect for the background
  document.addEventListener('mousemove', (e) => {
    const x = e.clientX / window.innerWidth;
    const y = e.clientY / window.innerHeight;
    const bg = document.querySelector('.gradient-bg');
    if (bg) {
      bg.style.background = `radial-gradient(circle at ${50 + (x - 0.5) * 10}% ${50 + (y - 0.5) * 10}%, #1a1a2e 0%, #050505 100%)`;
    }
  });
});
