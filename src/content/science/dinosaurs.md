---
title: What If the Asteroid Had Missed the Earth?
description: What if the dinosaurs had never gone extinct? Explore an alternate world of evolving dinosaurs, a different fate
  for mammals, and the possibility that humanity might never have existed.
image: /images/articles/science/dinosaurs/dinosaurs.jpg
tags:
- dinosaurs
- evolution
- extinction
- asteroid
- prehistoric
topics:
- evolution
- biology
world:
  id: world-dinosaurs-survive
  name: A World Ruled by Dinosaurs
  referenceWorld: Our World
divergence:
  id: divergence-asteroid-misses-earth
  type: EVENT_OUTCOME
  title: The asteroid misses Earth
  date: 66 million years ago
  referenceOutcome: The asteroid strikes Earth, triggering the mass extinction at the end of the Cretaceous.
  alternateOutcome: The asteroid misses Earth, allowing non-avian dinosaurs to survive and continue evolving.
timeline:
- id: event-asteroid-misses-earth
  headingId: a-cosmic-coin-toss
  date: 66 million years ago
  title: The asteroid misses Earth
  description: The impact never occurs and the Cretaceous extinction event unfolds differently.
- id: event-dinosaurs-continue-evolving
  headingId: a-world-ruled-by-reptiles
  date: 66–50 million years ago
  title: Dinosaurs continue to diversify
  description: Non-avian dinosaurs remain dominant across Earth's terrestrial ecosystems.
- id: event-mammals-remain-marginal
  headingId: the-rise-of-mammals
  date: Cenozoic era
  title: Mammals remain in the shadows
  description: Without the extinction of the dinosaurs, mammals do not receive the same evolutionary opportunity to diversify.
- id: event-alternate-intelligence
  headingId: a-different-kind-of-intelligence
  date: Millions of years later
  title: A different path to intelligence
  description: Some dinosaur lineages may evolve increasingly complex behaviour and intelligence, though the outcome remains
    uncertain.
- id: event-alternate-earth
  headingId: what-would-earth-look-like-today
  date: Today
  title: A very different Earth
  description: Earth remains dominated by ecosystems shaped by dinosaurs rather than mammals and primates.
entities:
- id: planet-earth
  type: PLANET
  name: Earth
- id: group-dinosaurs
  type: CLADE
  name: Dinosaurs
- id: group-mammals
  type: CLADE
  name: Mammals
- id: group-primates
  type: CLADE
  name: Primates
- id: group-humanity
  type: SPECIES
  name: Humanity
relationships:
- type: causes
  from: divergence-asteroid-misses-earth
  to: event-asteroid-misses-earth
  label: The asteroid's miss prevents the mass extinction
- type: ECOLOGICAL_PRESSURE
  from: group-dinosaurs
  to: group-mammals
  label: Continued dinosaur dominance constrains mammalian diversification
- type: EVOLUTIONARY_CHANGE
  from: group-dinosaurs
  to: group-primates
  label: Different ecosystems alter evolutionary opportunities
id: '000000011'
contentEntities:
- '0000000111'
- '0000000112'
- '0000000113'
- '0000000114'
- '0000000115'
- '0000000116'
- '0000000117'
---
