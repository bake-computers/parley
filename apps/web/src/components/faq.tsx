import { useState } from "react";
import { Plus } from "lucide-react";

const faqs = [
  {
    question: "How does ELO work?",
    answer:
      "Parley uses an internal ELO system based on match outcomes. Every win or loss adjusts your rating — no placement grind required. New players get an estimated starting ELO based on their Ubisoft ranked stats, so you can jump straight into competitive play.",
  },
  {
    question: "Is the bot free?",
    answer:
      "Yes. Core features — ELO tracking, team balancing, and matchmaking — are completely free. Tournament creation and advanced stats are available at no cost during the beta.",
  },
  {
    question: "Which platforms are supported?",
    answer:
      "PC, Xbox, and PlayStation. Parley auto-detects your platform from your Ubisoft stats, or you can set it manually. One account works across all servers.",
  },
  {
    question: "How do tournaments work?",
    answer:
      "Create a tournament with a single slash command. Choose single or double elimination, set the team count (up to 32), and Parley generates the bracket automatically. Results feed back into ELO — every tournament match counts.",
  },
  {
    question: "Can I customize match rules?",
    answer:
      "Yes. Server admins can configure match format (best-of series), map pool preferences, and ELO gain/loss multipliers. Defaults are tuned for competitive Siege, but every setting is adjustable.",
  },
];

export function Faq() {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  function toggle(index: number) {
    setOpenIndex((prev) => (prev === index ? null : index));
  }

  return (
    <section className="lp-section">
      <div className="mb-12">
        <p className="lp-label mb-2">FAQ</p>
        <h2 className="text-3xl md:text-4xl font-bold tracking-tight">Common questions</h2>
      </div>

      <div className="faq__list">
        {faqs.map((faq, i) => (
          <div key={faq.question} className="faq__item" data-open={openIndex === i}>
            <button
              className="faq__trigger"
              onClick={() => toggle(i)}
              aria-expanded={openIndex === i}
            >
              <span>{faq.question}</span>
              <Plus className="faq__icon" />
            </button>
            <div className="faq__content">
              <div className="faq__content-inner">
                <p className="faq__answer">{faq.answer}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
