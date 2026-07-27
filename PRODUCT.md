# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

The primary user is anyone planning an everyday outdoor trip in Miami: walkers,
cyclists, commuters, tourists, parents, older adults, and people who are more
sensitive to heat. A second Teams experience serves delivery-company
dispatchers and fleet safety leads who monitor multiple riders and intervene
when heat risk rises.

## Product Purpose

HeatGuard turns street-level temperature intelligence into practical routing and
heat-safety decisions. Everyday users get cooler route options, safer departure
times, exposure estimates, and hydration or rest guidance. Teams get a
fleet-wide operating view and can alert, reroute, or reschedule riders.

## Positioning

Unlike weather and routing products that treat a city as one temperature field,
HeatGuard scores candidate routes against FortyGuard's 2-meter temperature data
and cumulative exposure.

## Operating Context

The flagship journey starts with a person choosing an everyday destination and
travel mode. HeatGuard compares Mapbox alternatives, selects the coolest safe
path, estimates cumulative exposure, compares departure times, and recommends
hydration or rest breaks. The Teams view monitors multiple active riders on one
Miami map.

## Capabilities and Constraints

- FortyGuard heatmap requests are asynchronous and use a polygon area of
  interest, date/time, and meter granularity.
- Mapbox Directions alternatives provide candidate cycling or walking routes.
- Live credentials remain server-side or in `.env.local` and are never committed.
- The app must remain useful in a clearly labeled simulation when live API keys
  are unavailable.
- Heat risk is decision support, not medical advice.
- Personal heat sensitivity can make recommendations more cautious, but the MVP
  does not diagnose conditions or interpret medications.
- Dispatcher messaging and operational integrations are simulated in the MVP
  until a real fleet communication system is connected.

## Brand Commitments

The product name is HeatGuard. The interface is a practical operations
workbench: direct, calm, and specific about risk without using alarmist copy.

## Evidence on Hand

The repository contains a working Miami personal-route demonstration, a Teams
fleet dashboard, thermal scoring logic, FortyGuard and Mapbox adapters, a
simulated heat field, and a deployed private web app. No customer claims,
clinical validation, or production fleet integrations are established and must
not be fabricated.

## Product Principles

- Turn temperature data into an immediate action.
- Show cumulative exposure, not temperature alone.
- Make everyday heat decisions understandable without weather expertise.
- Keep Personal simple while giving Teams fleet-wide control.
- Label simulated and live information honestly.
- Preserve a safe fallback when external services are unavailable.

## Accessibility & Inclusion

Heat risk must be understandable without relying on color alone. Core controls
must remain keyboard accessible and usable on mobile screens in outdoor
conditions.
