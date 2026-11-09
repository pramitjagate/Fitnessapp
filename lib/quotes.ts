/**
 * One line a day for the home screen.
 *
 * A fixed list rather than a model call: it costs nothing, renders instantly,
 * and can't produce a quote nobody ever said. Attributed lines are ones with a
 * known source — the internet is full of Marcus Aurelius quotes he never wrote,
 * and a misattributed quote is a small lie on the first screen of the app.
 * Unattributed lines are our own.
 */
export interface Quote {
  text: string;
  author?: string;
}

export const QUOTES: Quote[] = [
  { text: "No great thing is created suddenly.", author: "Epictetus" },
  { text: "First say to yourself what you would be; and then do what you have to do.", author: "Epictetus" },
  { text: "Waste no more time arguing what a good man should be. Be one.", author: "Marcus Aurelius" },
  { text: "What stands in the way becomes the way.", author: "Marcus Aurelius" },
  {
    text: "It is not because things are difficult that we do not dare; it is because we do not dare that they are difficult.",
    author: "Seneca",
  },
  { text: "The journey of a thousand miles begins with a single step.", author: "Lao Tzu" },
  { text: "Fall seven times, stand up eight.", author: "Japanese proverb" },
  { text: "Strength does not come from physical capacity. It comes from an indomitable will.", author: "Mahatma Gandhi" },
  { text: "The Iron never lies to you.", author: "Henry Rollins" },
  { text: "Everybody wants to be a bodybuilder, but nobody wants to lift no heavy-ass weights.", author: "Ronnie Coleman" },
  { text: "Small improvements, every week. That's the whole programme." },
  { text: "The bar doesn't know how you feel. Show up anyway, then listen to it." },
  { text: "A held weight in a deficit is a win. Count it." },
  { text: "Consistency beats intensity you can't repeat." },
  { text: "Today's warm-up was someone's max once. Possibly yours." },
  { text: "Log it honestly. A plan is only as good as what you tell it." },
  { text: "Rest is part of the programme, not a break from it." },
  { text: "You don't need motivation for the first set. You need to walk in the door." },
  { text: "Two and a half kilos at a time is how big numbers get built." },
  { text: "Missed reps are information, not a verdict." },
  { text: "The best session is the one you actually do." },
  { text: "Sleep, protein, patience. The unglamorous three." },
  { text: "Leave one rep in the tank today so there's a session tomorrow." },
  { text: "Progress isn't a straight line. The trend is what counts." },
  { text: "Brace, breathe, push. Everything else is detail." },
  { text: "Nobody remembers the session you skipped. Your body does." },
  { text: "Be a little better than last week. That's enough." },
  { text: "Technique days build the lifts heavy days test." },
];

/**
 * The same quote all day, a different one tomorrow. Keyed on the date string
 * rather than a random pick, so a refresh doesn't shuffle it.
 */
export function quoteFor(isoDate: string): Quote {
  const day = Math.floor(new Date(isoDate + "T12:00:00Z").getTime() / 86400000);
  return QUOTES[((day % QUOTES.length) + QUOTES.length) % QUOTES.length];
}
