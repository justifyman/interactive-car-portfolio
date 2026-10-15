// Typed access to src/content.json. Edit the JSON — not this file — to change site text.
import raw from './content.json';

export interface Project {
  title: string;
  description: string;
  tech: string[];
  image: string;
  live: string;
  repo: string;
}

export interface Skill {
  name: string;
  group: string;
}

export interface ExperienceItem {
  kind: 'work' | 'education' | string;
  role: string;
  org: string;
  period: string;
  summary: string;
}

export interface Content {
  site: { url: string; description: string; ogImage: string };
  name: string;
  title: string;
  intro: string;
  about: { heading: string; paragraphs: string[]; facts: { label: string; value: string }[] };
  projects: Project[];
  skills: Skill[];
  experience: ExperienceItem[];
  contact: {
    email: string;
    message: string;
    socials: { label: string; url: string }[];
    formEndpoint: string;
  };
  resume: string;
  easterEgg: { title: string; message: string };
}

export const content = raw as Content;
