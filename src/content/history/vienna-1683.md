---
title: What If the Ottomans Had Taken Vienna?
description: What if Kara Mustafa had stormed the city in 1683 — and the Ottoman Empire had pushed into the heart of Europe?
  A journey through a continent that might have been.
image: /images/articles/history/vienna-1683/vienna-1683.jpg
tags:
- ottoman
- vienna
- habsburg
- siege
- empire
topics:
- wars
world:
  id: world-ottoman-vienna
  name: A Divided Europe
divergence:
  id: divergence-vienna-falls
  type: EVENT_OUTCOME
  title: The Ottoman army captures Vienna
  date: 1683-09
  referenceOutcome: The Ottoman siege fails after the arrival of the Polish relief army.
  alternateOutcome: Vienna falls before the relief army can save the city, altering the balance of power in Central Europe.
timeline:
- id: vienna-1683-timeline-1
  date: 1683-09
  title: The fall of Vienna
  description: Ottoman forces capture the Habsburg capital.
- id: vienna-1683-timeline-2
  date: Late 17th century
  title: The Ottoman advance
  description: The fall of Vienna changes the strategic balance in Central Europe.
- id: vienna-1683-timeline-3
  date: 18th century
  title: France fills the vacuum
  description: France expands its influence as European powers adjust to the altered balance.
- id: vienna-1683-timeline-4
  date: 18th century
  title: A different Enlightenment
  description: Intellectual and political developments unfold under a different continental order.
entities:
- id: polity-ottoman-empire
  type: POLITY
  name: Ottoman Empire
- id: entity-vienna
  type: PLACE
  name: Vienna
- id: entity-habsburg-monarchy
  type: STATE
  name: Habsburg Monarchy
- id: polity-france
  type: POLITY
  name: France
- id: entity-kara-mustafa
  type: PERSON
  name: Kara Mustafa Pasha
relationships:
- type: causes
  from: divergence-vienna-falls
  to: vienna-1683-timeline-1
  label: The Ottoman capture of Vienna changes the balance of power
- type: CONFLICT
  from: polity-ottoman-empire
  to: entity-habsburg-monarchy
  label: The balance of power in Central Europe shifts
- type: STRATEGIC_PRESSURE
  from: polity-ottoman-empire
  to: polity-france
  label: European powers adjust to Ottoman expansion
id: '000000009'
contentEntities:
- '0000000091'
- '0000000092'
- '0000000093'
- '0000000094'
- '0000000095'
- '0000000096'
- '0000000097'
---
