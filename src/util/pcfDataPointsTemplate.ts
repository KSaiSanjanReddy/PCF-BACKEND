// ------------------------------------------------------------------
// PCF Data Points template — Catena-X Semantic PCF Data Model v3.0.0
// (== technical field names of the v9.0.0 semantic model).
//
// This is the STATIC, ordered list of the ~118 rows shown at the bottom
// of the PCF request page after "Run PCF Calculation", PER COMPONENT.
//
// Each row is either:
//   - a HEADER  (section title, rendered as a coloured bar; `level` 1..3)
//   - a FIELD   (a data point with a value)
//
// A FIELD carries:
//   - label : human-readable name (the CSV "Field labels" column)
//   - mo    : "M" | "O" | "D" | "Mif" | "Oif" | "M 2027"  (the CSV M&O column;
//             frontend expands to "Mandatory"/"Optional"/… — backend sends raw)
//   - path  : where to read the value from inside buildPcfV9Payload() output.
//             `null` => system-generated at publish time, shown as null here.
//
// The VALUE for each field is resolved (in pcfDataPointsService) against the
// exact same JSON we publish to Quintari, so on-screen == published.
// ------------------------------------------------------------------

export type PcfDataPointHeader = {
    kind: "header";
    level: 1 | 2 | 3;
    label: string;
};

export type PcfDataPointField = {
    kind: "field";
    label: string;
    mo: string;
    /** dot/bracket path into buildPcfV9Payload() output; null => system-generated */
    path: string | null;
};

export type PcfDataPointTemplateRow = PcfDataPointHeader | PcfDataPointField;

// path prefixes into the buildPcfV9Payload() object
const SC = "scopeOfPcfForm[0]";
const CI = "companyAndProductInformation[0].companyInformation[0]";
const PI = "companyAndProductInformation[0].productInformation[0]";
const AI = "pcfAssessmentAndMethodology[0].pcfAssessmentInformation[0]";
const MO = "pcfAssessmentAndMethodology[0].pcfMethodology[0]";
const DS = "pcfAssessmentAndMethodology[0].dataSourcesAndQuality[0]";
const VS = "pcfAssessmentAndMethodology[0].verificationAndCertificationShares[0]";
const GEN = "general[0]";
const PROD = "productLifeCycleStagesAndEmissions[0].productionStage[0]";
const PACK = "productLifeCycleStagesAndEmissions[0].packagingStage[0]";
const DIST = "productLifeCycleStagesAndEmissions[0].distributionStage[0]";
const CC = "carbonContent[0]";
const AT = "attestationOfConformance[0]";

const h = (level: 1 | 2 | 3, label: string): PcfDataPointHeader => ({ kind: "header", level, label });
const f = (label: string, mo: string, path: string | null): PcfDataPointField => ({ kind: "field", label, mo, path });

export const PCF_DATA_POINTS_TEMPLATE: PcfDataPointTemplateRow[] = [
    // ===== Scope of PCF Form =====
    h(1, "Scope of PCF Form"),
    f("Data model / specification version", "M", `${SC}.specVersion`),
    f("Partial or full PCF (scope)", "D", `${SC}.partialFullPcf`),

    // ===== Company and Product Information =====
    h(1, "Company and Product Information"),
    h(2, "Company Information"),
    f("Company name", "M", `${CI}.companyName`),
    f("Company IDs (BPN)", "M", `${CI}.companyIds`),
    h(2, "Product Information"),
    f("Product name (company)", "M", `${PI}.productNameCompany`),
    f("Product IDs", "M", `${PI}.productIds`),
    f("Product description", "O", `${PI}.productDescription`),
    f("Product classifications", "O", `${PI}.productClassifications`),
    f("Declared unit of measurement", "M", `${PI}.declaredUnitOfMeasurement`),
    f("Declared unit amount", "M", `${PI}.declaredUnitAmount`),
    f("Product mass per declared unit (kg)", "M", `${PI}.productMassPerDeclaredUnit`),

    // ===== PCF Assessment and Methodology =====
    h(1, "PCF Assessment and Methodology"),
    h(2, "PCF Assessment Information"),
    h(3, "ID and Version"),
    f("ID", "M", null), // system-generated at publish
    f("Preceding PCF IDs", "O", `${AI}.idAndVersion[0].precedingPfIds`),
    f("Version", "D", `${AI}.idAndVersion[0].version`),
    f("Status", "D", `${AI}.idAndVersion[0].status`),
    f("Retrospective or prospective PCF type", "M", `${AI}.idAndVersion[0].retroOrProspectivePcfType`),
    h(3, "Boundary Specifications"),
    f("Exempted emissions percent", "M", `${AI}.boundarySpecifications[0].exemptedEmissionsPercent`),
    f("Exempted emissions description", "O", `${AI}.boundarySpecifications[0].exemptedEmissionsDescription`),
    f("Boundary processes description", "O", `${AI}.technology[0].boundaryProcessesDescription`),
    h(3, "Technology"),
    f("CCS technological CO2 capture included", "M", `${AI}.technology[0].ccsTechnologicalCO2CaptureIncluded`),
    h(3, "Geography"),
    f("Geography — country subdivision", "O", `${AI}.geography[0].geographyCountrySubdivision`),
    f("Geography — country", "O", `${AI}.geography[0].geographyCountry`),
    f("Geography — region or subregion", "M", `${AI}.geography[0].geographyRegionOrSubregion`),
    h(3, "Time"),
    f("Reference period start", "M", `${AI}.time[0].referencePeriodStart`),
    f("Reference period end", "M", `${AI}.time[0].referencePeriodEnd`),
    f("Created", "M", null), // system-generated at publish
    f("Validity period start", "O", `${AI}.time[0].validityPeriodStart`),
    f("Validity period end", "M", `${AI}.time[0].validityPeriodEnd`),
    h(2, "PCF Methodology"),
    h(3, "Standards"),
    f("Cross-sectoral standards", "M", `${MO}.standards[0].crossSectoralStandards`),
    f("Product or sector specific rules", "M", `${MO}.standards[0].productOrSectorSpecificRules`),
    h(3, "GWP Characterization Factor Details"),
    f("IPCC characterization factors", "M", `${MO}.gwpCharacterizationFactorDetails[0].ipccCharacterizationFactors`),
    h(3, "Allocation in Foreground (Own Processes)"),
    f("Allocation rules description", "O", `${MO}.allocationInForeground[0].allocationRulesDescription`),
    f("Allocation — waste incineration", "M", `${MO}.allocationInForeground[0].allocationWasteIncineration`),
    f("Allocation — recycled carbon", "O", `${MO}.allocationInForeground[0].allocationRecycledCarbon`),
    h(3, "Mass balancing Information"),
    f("Mass balancing used", "M", `${MO}.massBalancingInformation[0].massBalancingUsed`),
    f("Free attribution in mass balancing", "Mif", `${MO}.massBalancingInformation[0].freeAttributionInMassBalancing`),
    f("Mass balancing certificate scheme", "Mif", `${MO}.massBalancingInformation[0].massBalancingCertificateScheme`),
    h(2, "Data Sources and Quality"),
    f("Primary data share (%)", "M 2027", `${DS}.primaryDataShare`),
    f("Secondary emission factor sources", "M", `${DS}.secondaryEmissionFactorSources`),
    f("Technological DQR", "M 2027", `${DS}.technologicalDQR`),
    f("Temporal DQR", "M 2027", `${DS}.temporalDQR`),
    f("Geographical DQR", "M 2027", `${DS}.geographicalDQR`),
    h(2, "Verification and Certification Shares"),
    f("Program certification share", "O", `${VS}.programCertificationShare`),
    f("Product verification share — 3rd party", "O", `${VS}.productVerificationShare3rdParty`),
    f("Product verification share — 2nd party", "O", `${VS}.productVerificationShare2ndParty`),
    f("Product verification share — 1st party", "O", `${VS}.productVerificationShare1stParty`),
    h(2, "General"),
    f("Comment", "O", `${GEN}.comment`),
    f("PCF legal statement", "O", null), // not modelled in payload

    // ===== Product Life Cycle Stages and Emissions =====
    h(1, "Product Life Cycle Stages and Emissions"),
    h(2, "Production Stage"),
    f("PCF including biogenic uptake", "M", `${PROD}.pcfIncludingBiogenicUptake`),
    f("PCF excluding biogenic uptake", "M", `${PROD}.pcfExcludingBiogenicUptake`),
    f("Fossil GHG emissions", "O", `${PROD}.fossilGhgEmissions`),
    f("Biogenic non-CO2 emissions", "O", `${PROD}.biogenicNonCO2Emissions`),
    f("Biogenic CO2 uptake", "O", `${PROD}.biogenicCO2Uptake`),
    f("Land use change GHG emissions", "O", `${PROD}.landUseChangeGhgEmissions`),
    f("Land management biogenic CO2 emissions", "O", `${PROD}.landManagementBiogenicCO2Emissions`),
    f("Land management biogenic CO2 removals", "O", `${PROD}.landManagementBiogenicCO2Removals`),
    f("Aircraft GHG emissions", "O", `${PROD}.aircraftGhgEmissions`),
    h(2, "Packaging Stage"),
    f("Packaging emissions included", "M", `${PACK}.packagingEmissionsIncluded`),
    f("Packaging PCF including biogenic uptake", "O", `${PACK}.packagingPcfIncludingBiogenicUptake`),
    f("Packaging PCF excluding biogenic uptake", "O", `${PACK}.packagingPcfExcludingBiogenicUptake`),
    f("Packaging fossil GHG emissions", "O", `${PACK}.packagingFossilGhgEmissions`),
    f("Packaging biogenic non-CO2 emissions", "O", `${PACK}.packagingBiogenicNonCO2Emissions`),
    f("Packaging biogenic CO2 uptake", "O", `${PACK}.packagingBiogenicCO2Uptake`),
    f("Packaging land use change GHG emissions", "O", `${PACK}.packagingLandUseChangeGhgEmissions`),
    f("Packaging land management biogenic CO2 emissions", "O", `${PACK}.packagingLandManagementBiogenicCO2Emissions`),
    f("Packaging land management biogenic CO2 removals", "O", `${PACK}.packagingLandManagementBiogenicCO2Removals`),
    f("Packaging aircraft GHG emissions", "O", `${PACK}.packagingAircraftGhgEmissions`),
    h(2, "Distribution Stage"),
    f("Distribution stage included", "M", `${DIST}.distributionStageIncluded`),
    f("Distribution PCF including biogenic uptake", "O", `${DIST}.distributionStagePcfIncludingBiogenicUptake`),
    f("Distribution PCF excluding biogenic uptake", "O", `${DIST}.distributionStagePcfExcludingBiogenicUptake`),
    f("Distribution fossil GHG emissions", "O", `${DIST}.distributionStageFossilGhgEmissions`),
    f("Distribution biogenic non-CO2 emissions", "O", `${DIST}.distributionStageBiogenicNonCO2Emissions`),
    f("Distribution biogenic CO2 uptake", "O", `${DIST}.distributionStageBiogenicCO2Uptake`),
    f("Distribution land use change GHG emissions", "O", `${DIST}.distributionStageLandUseChangeGhgEmissions`),
    f("Distribution land management biogenic CO2 emissions", "O", `${DIST}.distributionStageLandManagementBiogenicCO2Emissions`),
    f("Distribution land management biogenic CO2 removals", "O", `${DIST}.distributionStageLandManagementBiogenicCO2Removals`),
    f("Distribution aircraft GHG emissions", "O", `${DIST}.distributionStageAircraftGhgEmissions`),

    // ===== Carbon Content =====
    h(1, "Carbon Content"),
    f("Carbon content total", "O", `${CC}.carbonContentTotal`),
    f("Fossil carbon content", "O", `${CC}.fossilCarbonContent`),
    f("Biogenic carbon content", "O", `${CC}.biogenicCarbonContent`),
    f("Packaging biogenic carbon content", "O", `${CC}.packagingBiogenicCarbonContent`),
    f("Recycled carbon content", "O", `${CC}.recycledCarbonContent`),

    // ===== Attestation of Conformance =====
    h(1, "Attestation of Conformance"),
    f("Attestation type", "Mif", `${AT}.attestationType`),
    f("Standard name", "Mif", `${AT}.standardName`),
    f("Attestation standard", "Mif", `${AT}.attestationStandard`),
    f("Attestation of conformance ID", "Mif", null), // system-generated at publish
    f("Attestation of conformance link", "Oif", `${AT}.attestationOfConformanceLink`),
    f("Provider name", "Mif", `${AT}.providerName`),
    f("Provider ID", "Oif", `${AT}.providerId`),
    f("Completed at", "Oif", `${AT}.completedAt`),
];
