import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { ShieldCheck, Languages, FileText, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';

/**
 * Welcome Page Component
 * Per DESIGN.md §6.1 - First launch experience with animation and privacy modal
 */
export default function Welcome() {
  const navigate = useNavigate();
  const prefersReducedMotion = useReducedMotion();
  const [showScrollCue, setShowScrollCue] = useState(false);

  useEffect(() => {
    if (prefersReducedMotion) {
      setShowScrollCue(true);
    } else {
      // Show scroll cue after animation sequence completes
      const timer = setTimeout(() => {
        setShowScrollCue(true);
      }, 2400);
      return () => clearTimeout(timer);
    }
  }, [prefersReducedMotion]);

  const handleEnterWorkspace = () => {
    // Persist first launch completion flag
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem('firstLaunchCompleted', 'true');
    }
    navigate('/transcribe');
  };

  const scrollToFeatures = () => {
    const featuresSection = document.getElementById('features-section');
    if (featuresSection) {
      featuresSection.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <div className="min-h-screen bg-bg overflow-auto">
      {/* Ambient background waveform */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden opacity-[0.08]">
        <motion.svg
          className="absolute inset-0 w-full h-full"
          viewBox="0 0 1200 800"
          preserveAspectRatio="xMidYMid slice"
          initial={{ x: 0 }}
          animate={{ x: prefersReducedMotion ? 0 : -50 }}
          transition={{
            duration: 60,
            repeat: Infinity,
            repeatType: 'reverse',
            ease: 'linear',
          }}
        >
          <motion.path
            d="M0,400 Q150,300 300,400 T600,400 T900,400 T1200,400"
            stroke="var(--color-olive)"
            strokeWidth="3"
            fill="none"
            initial={{ pathLength: 0, opacity: 0 }}
            animate={{ pathLength: 1, opacity: 0.6 }}
            transition={{ duration: 2, ease: 'easeOut' }}
          />
          <motion.path
            d="M0,420 Q150,340 300,420 T600,420 T900,420 T1200,420"
            stroke="var(--color-wood)"
            strokeWidth="2"
            fill="none"
            initial={{ pathLength: 0, opacity: 0 }}
            animate={{ pathLength: 1, opacity: 0.4 }}
            transition={{ duration: 2, delay: 0.2, ease: 'easeOut' }}
          />
        </motion.svg>
      </div>

      {/* Hero Section */}
      <section className="relative min-h-screen flex items-center justify-center px-6 md:px-8">
        <div className="w-full max-w-[720px] mx-auto">
          {/* Wordmark */}
          <motion.div
            className="flex items-center justify-center gap-3 mb-8"
            initial={prefersReducedMotion ? {} : { opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 1.6 }}
          >
            <h1 className="font-display font-semibold text-[2.5rem] text-text tracking-tight">
              MediScribe
            </h1>
            <span className="px-3 py-1 rounded-pill bg-primary-soft text-primary text-small font-semibold tracking-[0.06em] uppercase">
              Local
            </span>
          </motion.div>

          {/* Animation Stage */}
          <AnimationStage reducedMotion={prefersReducedMotion ?? false} />

          {/* Headline */}
          <motion.h2
            className="font-display text-display font-medium text-center text-text leading-[1.15] tracking-[-0.01em] mb-6 mt-12"
            initial={prefersReducedMotion ? {} : { opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 1.68 }}
          >
            Your lectures, transcribed on your machine.
          </motion.h2>

          {/* Supporting text */}
          <motion.p
            className="text-body text-text-muted text-center max-w-[560px] mx-auto leading-[1.5] mb-10"
            initial={prefersReducedMotion ? {} : { opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 1.76 }}
          >
            Local-first transcription studio for Turkish medical lectures. Clean, study-ready
            transcripts produced on your own GPU, with nothing leaving your machine.
          </motion.p>

          {/* CTA Row */}
          <motion.div
            className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-6"
            initial={prefersReducedMotion ? {} : { opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 1.84 }}
          >
            <Button size="lg" onClick={handleEnterWorkspace}>
              Enter workspace
            </Button>

            <PrivacyModal />
          </motion.div>

          {/* Scroll cue */}
          {showScrollCue && (
            <motion.button
              onClick={scrollToFeatures}
              className="mx-auto mt-16 flex flex-col items-center gap-2 text-text-muted hover:text-text transition-colors group"
              initial={prefersReducedMotion ? {} : { opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.6, delay: 2.2 }}
              aria-label="Scroll to features"
            >
              <span className="text-small">Continue</span>
              <motion.div
                animate={prefersReducedMotion ? {} : { y: [0, 6, 0] }}
                transition={{
                  duration: 2,
                  repeat: Infinity,
                  ease: 'easeInOut',
                }}
              >
                <ChevronDown className="w-5 h-5" />
              </motion.div>
            </motion.button>
          )}
        </div>
      </section>

      {/* Features Section */}
      <section
        id="features-section"
        className="relative py-24 px-6 md:px-8 bg-surface/30"
      >
        <div className="w-full max-w-[1200px] mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <FeatureCard
              icon={<ShieldCheck className="w-6 h-6" />}
              title="Private by design"
              description="Everything runs on your machine. Audio files never leave your computer. No cloud, no tracking, no accounts."
              delay={0}
              reducedMotion={prefersReducedMotion ?? false}
            />

            <FeatureCard
              icon={<Languages className="w-6 h-6" />}
              title="Built for Turkish medical lectures"
              description="Optimized for medical terminology and noisy conference halls. Pre-configured presets for best quality or speed."
              delay={0.1}
              reducedMotion={prefersReducedMotion ?? false}
            />

            <FeatureCard
              icon={<FileText className="w-6 h-6" />}
              title="Study-ready outputs"
              description="Get clean TXT for reading, timestamped Markdown for review, and segment JSON for tooling—all produced locally."
              delay={0.2}
              reducedMotion={prefersReducedMotion ?? false}
            />
          </div>
        </div>
      </section>
    </div>
  );
}

/**
 * Animation Stage - "From sound to notes"
 * Per DESIGN.md §8.1 - Three-stage morph animation
 */
function AnimationStage({ reducedMotion }: { reducedMotion: boolean }) {
  if (reducedMotion) {
    // Static composition - final frame with all elements visible
    return (
      <div className="relative w-full max-w-[480px] h-[280px] mx-auto mb-8 flex items-center justify-center">
        {/* Faded waveform background */}
        <svg
          className="absolute inset-0 w-full h-full opacity-20"
          viewBox="0 0 400 200"
          preserveAspectRatio="xMidYMid meet"
        >
          <WaveformPath opacity={1} />
        </svg>

        {/* Final notes card */}
        <div className="relative z-10 w-full max-w-[360px] bg-surface rounded-card border border-border shadow-card p-6">
          <div className="space-y-3">
            <div className="h-2 bg-text-faint/20 rounded-full w-full" />
            <div className="h-2 bg-text-faint/20 rounded-full w-[85%]" />
            <div className="h-2 bg-text-faint/20 rounded-full w-[92%]" />
            <div className="h-2 bg-text-faint/20 rounded-full w-[78%]" />
          </div>
          <div className="mt-4 flex items-center gap-2">
            <svg
              className="w-5 h-5 text-success"
              viewBox="0 0 20 20"
              fill="none"
              stroke="currentColor"
            >
              <motion.path
                d="M4 10 L8 14 L16 6"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                initial={{ pathLength: 1 }}
                animate={{ pathLength: 1 }}
              />
            </svg>
            <span className="text-small text-text-muted">Ready for study</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative w-full max-w-[480px] h-[280px] mx-auto mb-8 flex items-center justify-center">
      {/* Stage 1: Waveform (0-0.8s) */}
      <motion.svg
        className="absolute inset-0 w-full h-full"
        viewBox="0 0 400 200"
        preserveAspectRatio="xMidYMid meet"
        initial={{ opacity: 1 }}
        animate={{ opacity: 0.2 }}
        transition={{ duration: 0.4, delay: 1.6 }}
      >
        <WaveformPath opacity={1} />
      </motion.svg>

      {/* Stage 2: Segment chips (0.8-1.6s) */}
      <div className="absolute inset-0 flex items-center justify-center">
        <motion.div
          className="flex flex-col gap-3"
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 1, 1, 0] }}
          transition={{ duration: 1.2, delay: 0.8, times: [0, 0.2, 0.7, 1] }}
        >
          {[0, 1, 2, 3].map((i) => (
            <motion.div
              key={i}
              className="flex items-center gap-2 px-4 py-2 bg-primary-soft border border-primary/30 rounded-button"
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: 0.8 + i * 0.06 }}
            >
              <span className="font-mono text-[0.7rem] text-primary/70">
                {i * 30}:{(i * 15) % 60 < 10 ? '0' : ''}
                {(i * 15) % 60}
              </span>
              <div className="h-1.5 bg-primary/20 rounded-full w-24" />
            </motion.div>
          ))}
        </motion.div>
      </div>

      {/* Stage 3: Clean notes (1.6-2.4s) */}
      <motion.div
        className="absolute inset-0 flex items-center justify-center"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 1.6, ease: [0.22, 1, 0.36, 1] }}
      >
        <div className="w-full max-w-[360px] bg-surface rounded-card border border-border shadow-card p-6">
          <div className="space-y-3">
            {[100, 85, 92, 78].map((width, i) => (
              <motion.div
                key={i}
                className="h-2 bg-text-faint/20 rounded-full"
                style={{ width: `${width}%`, transformOrigin: 'left' }}
                initial={{ scaleX: 0 }}
                animate={{ scaleX: 1 }}
                transition={{ duration: 0.3, delay: 1.8 + i * 0.05 }}
              />
            ))}
          </div>
          <div className="mt-4 flex items-center gap-2">
            <svg
              className="w-5 h-5 text-success"
              viewBox="0 0 20 20"
              fill="none"
              stroke="currentColor"
            >
              <motion.path
                d="M4 10 L8 14 L16 6"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                initial={{ pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={{ duration: 0.4, delay: 2.0 }}
              />
            </svg>
            <motion.span
              className="text-small text-text-muted"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.3, delay: 2.1 }}
            >
              Ready for study
            </motion.span>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

/**
 * Waveform SVG Path - reusable waveform graphic
 */
function WaveformPath({ opacity = 1 }: { opacity?: number }) {
  return (
    <g>
      <motion.path
        d="M20,100 L30,80 L40,95 L50,70 L60,90 L70,60 L80,85 L90,65 L100,100 L110,75 L120,95 L130,70 L140,90 L150,80 L160,100 L170,85 L180,95 L190,75 L200,100 L210,80 L220,90 L230,70 L240,95 L250,75 L260,100 L270,85 L280,95 L290,80 L300,100 L310,75 L320,90 L330,70 L340,95 L350,80 L360,100 L370,85 L380,95"
        stroke="var(--color-wood)"
        strokeWidth="2.5"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={opacity}
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 0.8, ease: 'easeOut' }}
      />
      <motion.path
        d="M20,100 L30,85 L40,98 L50,78 L60,94 L70,68 L80,90 L90,72 L100,100 L110,80 L120,98 L130,76 L140,94 L150,86 L160,100 L170,90 L180,98 L190,80 L200,100 L210,85 L220,94 L230,76 L240,98 L250,80 L260,100 L270,90 L280,98 L290,85 L300,100 L310,80 L320,94 L330,76 L340,98 L350,86 L360,100 L370,90 L380,98"
        stroke="var(--color-olive)"
        strokeWidth="2"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={opacity * 0.6}
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 0.8, delay: 0.1, ease: 'easeOut' }}
      />
    </g>
  );
}

/**
 * Feature Card Component
 * Ventriloc-style card rhythm with icon, title, and description
 */
function FeatureCard({
  icon,
  title,
  description,
  delay,
  reducedMotion,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  delay: number;
  reducedMotion: boolean;
}) {
  return (
    <motion.div
      initial={reducedMotion ? {} : { opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-50px' }}
      transition={{ duration: 0.5, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      <Card className="p-6 h-full">
        <div className="w-12 h-12 rounded-button bg-primary-soft/60 flex items-center justify-center text-primary mb-4">
          {icon}
        </div>
        <h3 className="font-display text-h3 font-semibold text-text mb-3 tracking-[-0.01em]">
          {title}
        </h3>
        <p className="text-body text-text-muted leading-[1.5]">{description}</p>
      </Card>
    </motion.div>
  );
}

/**
 * Privacy Modal
 * Explains local-first privacy model
 */
function PrivacyModal() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="ghost" size="lg">
          What stays on this device?
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-[540px]">
        <DialogHeader>
          <DialogTitle className="font-display text-h2 flex items-center gap-2">
            <ShieldCheck className="w-6 h-6 text-primary" />
            Privacy by Design
          </DialogTitle>
          <DialogDescription className="text-body text-text-muted leading-[1.5] space-y-4 pt-4">
            <p>
              <strong className="text-text">MediScribe Local</strong> is built for complete
              privacy. Everything happens on your machine:
            </p>
            <ul className="space-y-2 pl-4">
              <li className="flex items-start gap-2">
                <span className="text-olive mt-1">●</span>
                <span>
                  <strong className="text-text">Audio files</strong> are read directly from your
                  disk and never uploaded anywhere.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-olive mt-1">●</span>
                <span>
                  <strong className="text-text">Transcription</strong> runs on your GPU/CPU using
                  locally installed AI models.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-olive mt-1">●</span>
                <span>
                  <strong className="text-text">Outputs</strong> (transcripts, timestamps, logs)
                  are written to folders you choose.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-olive mt-1">●</span>
                <span>
                  <strong className="text-text">Network access</strong> is used only when you
                  download AI models from Hugging Face. No telemetry, no analytics, no tracking.
                </span>
              </li>
            </ul>
            <p className="text-small text-text-muted pt-2">
              Local mode is the default and only active mode. Your data stays yours.
            </p>
          </DialogDescription>
        </DialogHeader>
      </DialogContent>
    </Dialog>
  );
}
