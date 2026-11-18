---
title: What If the Spanish Armada Had Landed?
description: What if the winds had turned — and the Spanish Armada had landed its army on English soil? A journey through
  a world where the Reformation was rolled back and the British Empire never rose.
image: /images/articles/history/spanish-armada/spanish-armada.jpg
tags:
- spain
- england
- armada
- tudor
- empire
topics:
- wars
world:
  id: world-spanish-armada-victory
  name: A Catholic England
divergence:
  id: divergence-spanish-armada-lands
  type: EVENT_OUTCOME
  title: The Spanish Armada successfully lands its invasion force
  date: '1588'
  referenceOutcome: The Armada fails, and Elizabethan England remains Protestant.
  alternateOutcome: Spanish forces land in England and restore Catholic rule.
timeline:
- id: spanish-armada-timeline-1
  date: '1588'
  title: The landing succeeds
  description: The Armada escorts Parma's army across the Channel.
- id: spanish-armada-timeline-2
  date: Late 16th century
  title: Catholic restoration
  description: England's religious settlement is overturned amid conflict and resistance.
- id: spanish-armada-timeline-3
  date: 17th century
  title: A different balance of power
  description: Spain's influence expands, but the cost of controlling England strains its empire.
- id: spanish-armada-timeline-4
  date: Modern era
  title: No British Empire as we know it
  description: Global trade and colonial expansion develop along a different path.
entities:
- id: entity-spanish-empire
  type: STATE
  name: Spanish Empire
- id: entity-england
  type: STATE
  name: England
- id: entity-elizabeth-i
  type: PERSON
  name: Elizabeth I
- id: entity-philip-ii
  type: PERSON
  name: Philip II of Spain
- id: entity-duke-parma
  type: PERSON
  name: Duke of Parma
relationships:
- type: causes
  from: divergence-spanish-armada-lands
  to: spanish-armada-timeline-1
  label: The successful landing establishes a foothold in England
- type: CONFLICT
  from: entity-spanish-empire
  to: entity-england
  label: Invasion and resistance
- type: POLITICAL_INFLUENCE
  from: entity-spanish-empire
  to: entity-england
  label: Spanish power shapes the religious settlement
id: '000000008'
contentEntities:
- '0000000081'
- '0000000082'
- '0000000083'
- '0000000084'
- '0000000085'
- '0000000086'
- '0000000087'
- '0000000088'
- '0000000089'
---
