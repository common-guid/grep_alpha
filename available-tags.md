# Approved Tag Taxonomy v2 (2026-10-02)
# Two tiers: sector tags (Tier 1+2) and asset-type tags (Tier 3).
# The extraction agent MUST pick tags ONLY from this list. Never invent tags.
# If no tag fits, use: Unknown_Sector
# Tier 3 tags describe the INSTRUMENT (ETF type); use at most one per ticker,
# combined with 1-3 sector tags. Max 5 tags per ticker.

## Tier 1 — Sector tags (canonical v1)
AI_Adjacent - if the industry or thesis has a distinct AI relation
Big_Tech - super large cap tech companies
Metals - anything related to metals production, or the material itself
Software - Company is primarily a software company
Semi-IDM - the integrated semiconductor companies
Semi-Fabless - the fabless semiconductor companies
Space - rocket launch, satellites, space
Memory - memory chips, RAM, Storage (SDD, HDD, NVME)
Hospitality - hospitality industry (restaurants, hotels, dining/leisure brands)
Bio - biotech, biopharma
Pharma - pharmaceuticals
MedTech - medical device technology makers
Network - anything communications related
Fiber_optics - producers and sellers of fiber optic components and systems
Aero - planes, flying components production and sales
Power - companies that create or sell power systems like generators or on-site energy production

## Tier 2 — Sector tags (v2 additions, promoted from pipeline usage)
Cloud - cloud infrastructure, SaaS/platform delivery, cloud service providers
Fintech - financial technology: payments platforms, digital banking, trading tech
Financial_Services - banks, brokers, asset managers, insurance, exchanges (non-tech financials)
Energy - oil & gas, utilities, energy services, traditional power generation
Healthcare - healthcare services, providers, health insurance, telehealth
Hardware - computers, servers, networking equipment, electronic components
Manufacturing - industrial production, machinery, construction, engineering firms
Cybersecurity - security software, network protection, threat intelligence
E-commerce - online retail, digital marketplaces, direct-to-consumer platforms
Transportation - shipping, rail, trucking, logistics, airlines' ground operations
Defense - military technology, defense contractors, aerospace defense systems
Entertainment - media, streaming, gaming, social platforms
Utilities - telecom carriers, water/gas utilities, regulated infrastructure

## Tier 3 — Asset-type tags (orthogonal; at most one per ticker)
ETF - exchange-traded fund (includes sector/thematic ETFs)
Broad_Market - broad-index exposure (S&P 500, Russell, Dow trackers)
Leveraged_ETF - leveraged or inverse ETF products (3x, 2x)
Blue_Chip - large-cap, stable, dividend-aristocrat profile
Dividend - held primarily for dividend yield

## Fallback
Unknown_Sector - no taxonomy tag fits; thesis must explain the business
