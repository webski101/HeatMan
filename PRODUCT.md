# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

The MVP serves delivery riders and gig couriers working outdoors in Miami. The
buying and operating user is a delivery-company dispatcher or fleet safety lead
who monitors multiple riders, intervenes when heat risk rises, and reviews fleet
exposure.

## Product Purpose

HeatMan turns street-level temperature intelligence into practical routing and
heat-safety decisions. Riders get cooler route options, exposure estimates, and
hydration or rest guidance. Dispatchers get a fleet-wide operating view and can
alert, reroute, or reschedule riders.

## Positioning

Unlike weather and routing products that treat a city as one temperature field,
HeatMan scores candidate routes against FortyGuard's 2-meter temperature data
and cumulative exposure.

## Operating Context

The flagship journey starts with a delivery route between two stops inside a
shift window. HeatMan compares Mapbox route alternatives, selects the coolest
safe path, estimates cumulative exposure, and recommends hydration or rest
breaks. The dispatcher view monitors multiple active riders on one Miami map.

## Capabilities and Constraints

- FortyGuard heatmap requests are asynchronous and use a polygon area of
  interest, date/time, and meter granularity.
- Mapbox Directions alternatives provide candidate cycling or walking routes.
- Live credentials remain server-side or in `.env.local` and are never committed.
- The app must remain useful in a clearly labeled simulation when live API keys
  are unavailable.
- Heat risk is decision support, not medical advice.
- Dispatcher messaging and operational integrations are simulated in the MVP
  until a real fleet communication system is connected.

## Brand Commitments

The product name is HeatMan. The interface is a practical operations
workbench: direct, calm, and specific about risk without using alarmist copy.

## Evidence on Hand

The repository contains a working Miami rider route demonstration, thermal
scoring logic, FortyGuard and OpenRouteService adapters, a simulated heat field, and a
deployed private web app. No customer claims, clinical validation, or production
fleet integrations are established and must not be fabricated.

## Product Principles

- Turn temperature data into an immediate action.
- Show cumulative exposure, not temperature alone.
- Keep the rider experience simple while giving dispatchers fleet-wide control.
- Label simulated and live information honestly.
- Preserve a safe fallback when external services are unavailable.

## Accessibility & Inclusion

Heat risk must be understandable without relying on color alone. Core controls
must remain keyboard accessible and usable on mobile screens in outdoor
conditions.
