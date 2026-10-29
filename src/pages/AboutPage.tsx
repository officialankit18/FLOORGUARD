import React from 'react';
import { UsersRound } from 'lucide-react';

const members = [
  { name: 'Adarsh Srivastava', role: 'Team Leader', focus: 'Project direction and coordination' },
  { name: 'Ankit Yadav', role: 'Hardware & IoT Co-Developer', focus: 'Connected devices and system integration' },
  { name: 'Abhishek Pandey', role: 'Testing & Integration Co-Developer', focus: 'System testing and integration' },
  { name: 'Kushagra Awasthi', role: 'Firmware & Circuit Specialist', focus: 'Controller firmware and electronics' },
  { name: 'Arpit Chaturvedi', role: 'Documentation & Research Analyst', focus: 'Research and technical documentation' },
];

export const AboutPage: React.FC = () => <main className="fg-about-page"><div className="fg-about-hero"><img src="/images/diagrams/team_5g_logo.png" alt="Team 5G logo" /><span>THE PEOPLE BEHIND FLOORGUARD</span><h1>Team 5G</h1><p>Five Glitchbreakers building a connected home security experience through sensors, cameras and real-time software.</p></div><h2>Meet the team</h2><div className="fg-about-grid">{members.map(member => <article key={member.name}><div className="fg-about-avatar" aria-label={`Photo of ${member.name} coming soon`}><UsersRound size={32} /></div><div><h3>{member.name}</h3><strong>{member.role}</strong><p>{member.focus}</p></div></article>)}</div><p className="fg-about-photo-note">Team portraits will appear here when the individual photos are provided.</p></main>;
