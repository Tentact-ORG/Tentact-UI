export interface AudienceCard {
  image: string;
  label: string;
}

/** Audiences in the database, flowing through the perspective tunnel. */
export const AUDIENCE_CARDS: readonly AudienceCard[] = [
  { image: "/assets/who/founders.jpg", label: "Founders" },
  { image: "/assets/who/local-businesses.jpg", label: "Local businesses" },
  { image: "/assets/who/engineers.jpg", label: "Engineers" },
  { image: "/assets/who/creators.jpg", label: "Creators" },
  { image: "/assets/who/cmos-in-new-roles.jpg", label: "CMOs in new roles" },
  { image: "/assets/who/agencies.jpg", label: "Agencies" },
  { image: "/assets/people/crowd.jpg", label: "Communities" },
  { image: "/assets/who/hiring-managers.jpg", label: "Hiring managers" },
  { image: "/assets/who/marketers.jpg", label: "Marketers" },
  { image: "/assets/who/decision-makers.jpg", label: "Decision makers" },
  { image: "/assets/who/investors.jpg", label: "Investors" },
  { image: "/assets/who/e-commerce.jpg", label: "E-commerce" },
  { image: "/assets/who/saas-buyers.jpg", label: "SaaS buyers" },
];
