import React, { useEffect, useRef } from 'react';
import { GameStatus } from '../types.js';

interface GameCanvasProps {
  status: GameStatus;
  multiplier: number;
  timeLeft: number;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  color: string;
  alpha: number;
  life: number;
}

interface Cloud {
  x: number;
  y: number;
  speed: number;
  scale: number;
}

export default function GameCanvas({ status, multiplier, timeLeft }: GameCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationFrameRef = useRef<number | null>(null);

  // Flight path parameters
  const planePos = useRef({ x: 50, y: 350 });
  const gridOffset = useRef(0);
  const particles = useRef<Particle[]>([]);
  const clouds = useRef<Cloud[]>([]);

  // Initialize clouds
  useEffect(() => {
    clouds.current = Array.from({ length: 6 }, () => ({
      x: Math.random() * 800,
      y: Math.random() * 200 + 40,
      speed: Math.random() * 0.4 + 0.1,
      scale: Math.random() * 0.6 + 0.4
    }));
  }, []);

  // Handle particle explosion trigger on crash
  useEffect(() => {
    if (status === 'crashed') {
      const px = planePos.current.x;
      const py = planePos.current.y;
      const explosionParticles: Particle[] = [];
      const colors = ['#ef4444', '#f97316', '#eab308', '#ffffff', '#78716c'];

      for (let i = 0; i < 40; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = Math.random() * 6 + 2;
        explosionParticles.push({
          x: px,
          y: py,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          radius: Math.random() * 4 + 2,
          color: colors[Math.floor(Math.random() * colors.length)],
          alpha: 1.0,
          life: Math.random() * 30 + 20
        });
      }
      particles.current = explosionParticles;
    } else {
      particles.current = [];
    }
  }, [status]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const canvasWidth = 800;
    const canvasHeight = 450;

    let localOffset = 0;

    const render = () => {
      // 1. Clear Screen
      ctx.fillStyle = '#0a0d14'; // Cool deep space slate/navy
      ctx.fillRect(0, 0, canvasWidth, canvasHeight);

      // 2. Draw Moving Tech Grid Backdrop
      // Grid speed increases as multiplier increases
      const speedModifier = status === 'running' ? Math.min(6, 1 + (multiplier - 1) * 0.5) : 0.4;
      localOffset = (localOffset + speedModifier) % 40;
      gridOffset.current = localOffset;

      ctx.strokeStyle = 'rgba(31, 41, 55, 0.4)'; // subtle dark border
      ctx.lineWidth = 1;

      // Draw vertical scrolling grid lines
      for (let x = -40; x < canvasWidth + 40; x += 40) {
        ctx.beginPath();
        ctx.moveTo(x - gridOffset.current, 0);
        ctx.lineTo(x - gridOffset.current, canvasHeight);
        ctx.stroke();
      }

      // Draw horizontal static grid lines
      for (let y = 0; y < canvasHeight; y += 40) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(canvasWidth, y);
        ctx.stroke();
      }

      // 3. Draw Parallax Scrolling Clouds
      ctx.fillStyle = 'rgba(75, 85, 99, 0.15)'; // light cloud shadow
      clouds.current.forEach((cloud) => {
        // move cloud
        const cloudSpeed = cloud.speed * (status === 'running' ? speedModifier : 1);
        cloud.x -= cloudSpeed;
        if (cloud.x < -150) {
          cloud.x = canvasWidth + 50;
          cloud.y = Math.random() * 200 + 40;
        }

        // Draw cloud puff
        ctx.beginPath();
        const cx = cloud.x;
        const cy = cloud.y;
        const s = cloud.scale;
        ctx.arc(cx, cy, 30 * s, 0, Math.PI * 2);
        ctx.arc(cx + 25 * s, cy - 10 * s, 35 * s, 0, Math.PI * 2);
        ctx.arc(cx + 50 * s, cy, 30 * s, 0, Math.PI * 2);
        ctx.arc(cx + 25 * s, cy + 15 * s, 25 * s, 0, Math.PI * 2);
        ctx.closePath();
        ctx.fill();
      });

      // 4. Calculate Plane Position
      // In betting status: plane sits idling on runway
      // In running status: plane takes off and flies along exponential curve
      // In crashed status: plane disappeared, explosion particles render
      if (status === 'betting') {
        planePos.current = { x: 80, y: 380 + Math.sin(Date.now() * 0.005) * 3 };
      } else if (status === 'running') {
        // Map elapsed progression to standard visual curve
        // Limit coordinates to stay inside canvas safe-margins
        const progress = Math.min(1.0, (multiplier - 1) / 10); // reaches max height around 11x visually
        const px = 80 + progress * 550; // starts at 80, flies to 630
        const py = 380 - Math.pow(progress, 0.7) * 260; // moves from 380 to 120
        planePos.current = { 
          x: px, 
          y: py + Math.sin(Date.now() * 0.01) * 4 // add subtle vibration/turbulence
        };
      }

      // 5. Draw Flight Curve (Golden Gradient Trail)
      if (status === 'running' || status === 'crashed') {
        const px = planePos.current.x;
        const py = planePos.current.y;

        ctx.beginPath();
        ctx.moveTo(80, 380);
        
        // Draw elegant curve to plane's current position
        ctx.quadraticCurveTo(
          80 + (px - 80) * 0.3, 
          380, 
          px, 
          py
        );

        // Styling the trail
        const gradient = ctx.createLinearGradient(80, 380, px, py);
        gradient.addColorStop(0, 'rgba(239, 68, 68, 0.1)'); // red transparent
        gradient.addColorStop(0.5, 'rgba(234, 179, 8, 0.4)'); // yellow
        gradient.addColorStop(1, '#ef4444'); // hot red
        
        ctx.strokeStyle = gradient;
        ctx.lineWidth = 4;
        ctx.shadowColor = 'rgba(239, 68, 68, 0.5)';
        ctx.shadowBlur = 10;
        ctx.stroke();
        ctx.shadowBlur = 0; // reset shadow

        // Fill area under curve
        ctx.beginPath();
        ctx.moveTo(80, 380);
        ctx.quadraticCurveTo(80 + (px - 80) * 0.3, 380, px, py);
        ctx.lineTo(px, 380);
        ctx.closePath();
        
        const fillGradient = ctx.createLinearGradient(80, 200, 80, 380);
        fillGradient.addColorStop(0, 'rgba(239, 68, 68, 0.15)');
        fillGradient.addColorStop(1, 'rgba(239, 68, 68, 0.0)');
        ctx.fillStyle = fillGradient;
        ctx.fill();
      }

      // 6. Draw the Runway / Ground Line
      ctx.strokeStyle = '#1e293b';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(40, 380);
      ctx.lineTo(760, 380);
      ctx.stroke();

      // 7. Draw the Plane
      if (status !== 'crashed') {
        const px = planePos.current.x;
        const py = planePos.current.y;

        ctx.save();
        ctx.translate(px, py);

        // Tilt plane upwards as it flies
        let tilt = -0.05;
        if (status === 'running') {
          tilt = -Math.min(0.35, 0.05 + (multiplier - 1) * 0.03);
        }
        ctx.rotate(tilt);

        // Draw Beautiful Glowing Jet Red Wing Shape (Aviator iconic plane look)
        // Red main fuselage
        ctx.fillStyle = '#ef4444';
        ctx.strokeStyle = '#991b1b';
        ctx.lineWidth = 1.5;

        // Fuselage path
        ctx.beginPath();
        ctx.moveTo(-15, -5);
        ctx.lineTo(15, -4);
        ctx.lineTo(25, 0); // nose
        ctx.lineTo(15, 4);
        ctx.lineTo(-15, 5);
        ctx.lineTo(-22, 10); // tail
        ctx.lineTo(-20, -10); // tail top
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Canopy (Glass cockpit)
        ctx.fillStyle = '#38bdf8'; // light sky blue
        ctx.beginPath();
        ctx.moveTo(2, -4);
        ctx.lineTo(10, -3);
        ctx.lineTo(12, 0);
        ctx.lineTo(2, 0);
        ctx.closePath();
        ctx.fill();

        // Wing details
        ctx.fillStyle = '#dc2626';
        ctx.beginPath();
        ctx.moveTo(-5, 0);
        ctx.lineTo(-8, 18); // lower wing
        ctx.lineTo(-2, 18);
        ctx.lineTo(5, 0);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(-5, 0);
        ctx.lineTo(-12, -16); // upper wing
        ctx.lineTo(-6, -16);
        ctx.lineTo(5, 0);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Propeller hub (Nose spin yellow)
        ctx.fillStyle = '#eab308';
        ctx.beginPath();
        ctx.arc(24, 0, 3, 0, Math.PI * 2);
        ctx.fill();

        // Spinning prop blurs (if flying/running)
        if (status === 'running' || status === 'betting') {
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          const propLength = 12;
          const phase = (Date.now() * 0.05) % Math.PI;
          ctx.moveTo(24, -Math.sin(phase) * propLength);
          ctx.lineTo(24, Math.sin(phase) * propLength);
          ctx.stroke();
        }

        // Thrust Jet Flame Fire (if running)
        if (status === 'running') {
          const flameSize = 10 + Math.sin(Date.now() * 0.1) * 4;
          const flameGradient = ctx.createLinearGradient(-35, 0, -22, 0);
          flameGradient.addColorStop(0, 'rgba(239, 68, 68, 0)');
          flameGradient.addColorStop(0.5, '#f97316');
          flameGradient.addColorStop(1, '#eab308');
          ctx.fillStyle = flameGradient;
          ctx.beginPath();
          ctx.moveTo(-22, -2);
          ctx.lineTo(-22 - flameSize, 0);
          ctx.lineTo(-22, 2);
          ctx.closePath();
          ctx.fill();
        }

        ctx.restore();
      }

      // 8. Draw Explosion Particles (on crash)
      if (status === 'crashed' && particles.current.length > 0) {
        particles.current.forEach((p, idx) => {
          p.x += p.vx;
          p.y += p.vy;
          p.vy += 0.05; // soft gravity
          p.life--;
          p.alpha = Math.max(0, p.life / 30);

          ctx.fillStyle = p.color;
          ctx.globalAlpha = p.alpha;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
          ctx.fill();
        });
        ctx.globalAlpha = 1.0; // reset alpha

        // Filter out dead particles
        particles.current = particles.current.filter((p) => p.life > 0);
      }

      // 9. Render Multiplier HUD Overlays
      if (status === 'betting') {
        // Render Countdown Overlay
        ctx.fillStyle = 'rgba(10, 13, 20, 0.75)';
        ctx.fillRect(0, 0, canvasWidth, canvasHeight);

        // Next flight starts in countdown
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        
        ctx.font = '500 24px "Inter", sans-serif';
        ctx.fillStyle = '#94a3b8'; // Cool text slate
        ctx.fillText('NEXT ROUND STARTS IN', canvasWidth / 2, canvasHeight / 2 - 35);

        // Large countdown circle
        const radius = 55;
        const cx = canvasWidth / 2;
        const cy = canvasHeight / 2 + 40;

        // Circular background track
        ctx.strokeStyle = '#1e293b';
        ctx.lineWidth = 8;
        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, Math.PI * 2);
        ctx.stroke();

        // Active sweep track
        const startAngle = -Math.PI / 2;
        const endAngle = startAngle + (timeLeft / 6.0) * (Math.PI * 2);
        ctx.strokeStyle = '#ef4444'; // Red spinner
        ctx.lineWidth = 8;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.arc(cx, cy, radius, startAngle, endAngle);
        ctx.stroke();
        ctx.lineCap = 'butt'; // reset

        ctx.font = '700 36px "Inter", sans-serif';
        ctx.fillStyle = '#ffffff';
        ctx.fillText(`${timeLeft.toFixed(1)}s`, cx, cy + 1);
      } else if (status === 'running') {
        // Climbing Multiplier Display
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        
        ctx.font = '800 68px "Inter", sans-serif';
        ctx.fillStyle = '#ffffff';
        ctx.shadowColor = 'rgba(255, 255, 255, 0.2)';
        ctx.shadowBlur = 15;
        ctx.fillText(`${multiplier.toFixed(2)}x`, canvasWidth / 2, 120);
        ctx.shadowBlur = 0; // reset
      } else if (status === 'crashed') {
        // Crashed Overlay
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        ctx.font = '800 52px "Inter", sans-serif';
        ctx.fillStyle = '#ef4444';
        ctx.shadowColor = 'rgba(239, 68, 68, 0.4)';
        ctx.shadowBlur = 20;
        ctx.fillText('FLEW AWAY!', canvasWidth / 2, 120);
        ctx.shadowBlur = 0;

        ctx.font = '700 36px "Inter", sans-serif';
        ctx.fillStyle = '#94a3b8';
        ctx.fillText(`Crashed @ ${multiplier.toFixed(2)}x`, canvasWidth / 2, 185);
      }

      animationFrameRef.current = requestAnimationFrame(render);
    };

    render();

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [status, multiplier, timeLeft]);

  return (
    <div className="relative w-full overflow-hidden rounded-xl border border-slate-800 bg-slate-950 shadow-2xl">
      <div className="absolute top-4 left-4 z-10 flex items-center gap-2 rounded-full bg-slate-900/80 px-3 py-1.5 border border-slate-800 text-xs text-slate-400 backdrop-blur-sm">
        <span className={`h-2.5 w-2.5 rounded-full ${status === 'running' ? 'bg-red-500 animate-pulse' : status === 'betting' ? 'bg-amber-500 animate-ping' : 'bg-red-600'}`}></span>
        <span className="font-semibold uppercase tracking-wider font-sans">
          {status === 'running' ? 'Active Flight' : status === 'betting' ? 'Betting Open' : 'Crashed'}
        </span>
      </div>

      {status === 'running' && (
        <div className="absolute top-4 right-4 z-10 flex items-center gap-1.5 rounded-full bg-red-500/10 px-3 py-1.5 border border-red-500/20 text-xs font-semibold text-red-400 backdrop-blur-sm animate-pulse font-mono">
          🚀 CLIMBING SPEED: {Math.max(100, Math.floor(multiplier * 180))} km/h
        </div>
      )}

      <div className="w-full aspect-[16/9]">
        <canvas
          ref={canvasRef}
          width={800}
          height={450}
          className="h-full w-full object-cover"
        />
      </div>
    </div>
  );
}
