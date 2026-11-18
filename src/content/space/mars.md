---
title: What If Mars Never Lost Its Ancient Oceans?
description: What if our closest planetary neighbor stayed blue and lush? Explore the space race for a living world next door
  — and what it would mean for humanity.
image: /images/articles/space/mars/mars.jpg
tags:
- mars
- space
- life
- colonization
- solar-system
topics:
- mars-worlds
world:
  id: world-living-mars
  name: Living Mars
  referenceWorld: Our World
divergence:
  id: divergence-mars-keeps-oceans
  type: PLANETARY_STATE
  title: Mars retains its oceans and thick atmosphere
  referenceOutcome: Mars loses most of its atmosphere and surface water, becoming a cold desert.
  alternateOutcome: Mars remains a warm, water-rich and potentially habitable world.
timeline:
- id: event-mars-retains-habitability
  date: Ancient Mars
  title: Mars retains its oceans and atmosphere
  description: Mars remains warm and wet instead of losing its surface water and thick atmosphere.
- id: event-humanity-observes-living-mars
  date: Ancient civilizations
  title: Humanity observes a blue Mars
  description: Mars appears as a visibly active and potentially habitable world in the night sky.
- id: event-mars-space-race
  date: 20th century
  title: The race for Mars
  description: The space age becomes a race to reach and study a living neighbouring world.
- id: event-mars-research-bases
  date: 1980s
  title: Permanent research bases become possible
  description: Long-term human research presence on Mars becomes conceivable.
- id: event-mars-settlements
  date: 2000s
  title: Human settlements beyond Earth
  description: Humanity may establish its first permanent settlements beyond Earth.
entities:
- id: planet-mars
  type: PLANET
  name: Mars
- id: planet-earth
  type: PLANET
  name: Earth
- id: group-humanity
  type: SPECIES
  name: Humanity
- id: state-united-states
  type: POLITY
  name: United States
- id: state-soviet-union
  type: POLITY
  name: Soviet Union
- id: feature-ancient-oceans
  type: ENVIRONMENT
  name: Ancient oceans
relationships:
- type: causes
  from: divergence-mars-keeps-oceans
  to: event-mars-retains-habitability
  label: Mars retains its oceans and remains potentially habitable
- type: PLANETARY_CHANGE
  from: planet-mars
  to: feature-ancient-oceans
  label: Persistent surface water reshapes planetary history
- type: SCIENTIFIC_DISCOVERY
  from: planet-mars
  to: planet-earth
  label: Evidence of ancient life changes science and philosophy
id: '000000013'
contentEntities:
- '0000000131'
- '0000000132'
- '0000000133'
- '0000000134'
- '0000000135'
- '0000000136'
- '0000000137'
- '0000000138'
---
