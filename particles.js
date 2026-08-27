/* ============================================
   Particle Animation Background
   Ethereal floating particles for glass theme
   ============================================ */

(function() {
    const canvas = document.getElementById('particleCanvas');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    let particles = [];
    let animationId;
    let mouse = { x: null, y: null, radius: 180 };

    function resize() {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
    }

    window.addEventListener('resize', resize);
    resize();

    // Track mouse position
    window.addEventListener('mousemove', (e) => {
        mouse.x = e.x;
        mouse.y = e.y;
    });

    window.addEventListener('mouseout', () => {
        mouse.x = null;
        mouse.y = null;
    });

    class Particle {
        constructor() {
            this.x = Math.random() * canvas.width;
            this.y = Math.random() * canvas.height;
            this.size = Math.random() * 2.5 + 0.3;
            this.speedX = (Math.random() - 0.5) * 0.3;
            this.speedY = (Math.random() - 0.5) * 0.3;
            this.opacity = Math.random() * 0.4 + 0.05;
            this.baseOpacity = this.opacity;
            this.pulseSpeed = Math.random() * 0.02 + 0.005;
            this.pulseOffset = Math.random() * Math.PI * 2;

            // Softer color palette for glass theme
            const colorChoice = Math.random();
            if (colorChoice < 0.35) {
                this.color = '34, 211, 238';    // cyan
            } else if (colorChoice < 0.6) {
                this.color = '167, 139, 250';   // violet
            } else if (colorChoice < 0.8) {
                this.color = '244, 114, 182';   // pink
            } else {
                this.color = '148, 163, 184';   // silver
            }
        }

        update(time) {
            this.x += this.speedX;
            this.y += this.speedY;

            // Gentle pulse effect
            this.opacity = this.baseOpacity + Math.sin(time * this.pulseSpeed + this.pulseOffset) * 0.1;
            this.opacity = Math.max(0.02, Math.min(this.opacity, 0.5));

            // Wrap around edges
            if (this.x > canvas.width + 10) this.x = -10;
            if (this.x < -10) this.x = canvas.width + 10;
            if (this.y > canvas.height + 10) this.y = -10;
            if (this.y < -10) this.y = canvas.height + 10;

            // Mouse interaction - softer repulsion
            if (mouse.x !== null && mouse.y !== null) {
                const dx = mouse.x - this.x;
                const dy = mouse.y - this.y;
                const distance = Math.sqrt(dx * dx + dy * dy);

                if (distance < mouse.radius) {
                    const force = (mouse.radius - distance) / mouse.radius;
                    this.x -= dx * force * 0.008;
                    this.y -= dy * force * 0.008;
                    // Brighten near mouse
                    this.opacity = Math.min(this.opacity + force * 0.15, 0.6);
                }
            }
        }

        draw() {
            // Soft glow effect
            if (this.size > 1.5) {
                const gradient = ctx.createRadialGradient(this.x, this.y, 0, this.x, this.y, this.size * 3);
                gradient.addColorStop(0, `rgba(${this.color}, ${this.opacity * 0.5})`);
                gradient.addColorStop(1, `rgba(${this.color}, 0)`);
                ctx.beginPath();
                ctx.arc(this.x, this.y, this.size * 3, 0, Math.PI * 2);
                ctx.fillStyle = gradient;
                ctx.fill();
            }

            ctx.beginPath();
            ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(${this.color}, ${this.opacity})`;
            ctx.fill();
        }
    }

    function init() {
        particles = [];
        const density = (canvas.width * canvas.height) / 18000;
        const count = Math.min(Math.floor(density), 80);

        for (let i = 0; i < count; i++) {
            particles.push(new Particle());
        }
    }

    function drawConnections() {
        const maxDistance = 130;

        for (let i = 0; i < particles.length; i++) {
            for (let j = i + 1; j < particles.length; j++) {
                const dx = particles[i].x - particles[j].x;
                const dy = particles[i].y - particles[j].y;
                const distance = Math.sqrt(dx * dx + dy * dy);

                if (distance < maxDistance) {
                    const opacity = (1 - distance / maxDistance) * 0.08;

                    // Gradient line between two particle colors
                    const gradient = ctx.createLinearGradient(
                        particles[i].x, particles[i].y,
                        particles[j].x, particles[j].y
                    );
                    gradient.addColorStop(0, `rgba(${particles[i].color}, ${opacity})`);
                    gradient.addColorStop(1, `rgba(${particles[j].color}, ${opacity})`);

                    ctx.beginPath();
                    ctx.strokeStyle = gradient;
                    ctx.lineWidth = 0.5;
                    ctx.moveTo(particles[i].x, particles[i].y);
                    ctx.lineTo(particles[j].x, particles[j].y);
                    ctx.stroke();
                }
            }
        }
    }

    let time = 0;
    function animate() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        time++;

        particles.forEach(p => {
            p.update(time);
            p.draw();
        });

        drawConnections();
        animationId = requestAnimationFrame(animate);
    }

    init();
    animate();

    // Reinitialize on resize
    let resizeTimer;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(init, 200);
    });
})();
