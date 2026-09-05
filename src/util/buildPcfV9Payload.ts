import { randomUUID } from "node:crypto";

export const PCF_V9_SEMANTIC_ID = "urn:samm:io.catenax.pcf:9.0.0#Pcf";
export const PCF_V9_SPEC_VERSION = "urn:io.catenax.pcf:datamodel:version:9.0.0";

export type PcfScope = "Cradle-to-gate" | "Cradle-to-grave";
export type PcfStatus = "Active" | "Deprecated";
export type RetroOrProspective = "Retrospective PCF" | "Prospective PCF";

export interface EnviraanPcfInput {
    productCode: string;
    productName: string;
    productDescription?: string;
    productMassKg?: number;
    declaredUnitOfMeasurement?: string;
    declaredUnitAmount?: number;
    productClassifications?: string[];

    companyName: string;
    companyBpn: string;

    totalPcfValue: number;
    materialValue?: number;
    productionValue?: number;
    packagingValue?: number;
    logisticValue?: number;
    wasteValue?: number;

    geographyCountry: string;
    geographyCountrySubdivision?: string;
    geographyRegionOrSubregion?: string;

    referencePeriodStart: string;
    referencePeriodEnd: string;
    validityPeriodStart?: string;
    validityPeriodEnd?: string;

    pcfScope: PcfScope;
    crossSectoralStandards?: string[];
    productOrSectorSpecificRules?: string[];
    ipccCharacterizationFactors?: "AR5" | "AR6";
    allocationRecycledCarbon?: string;
    allocationWasteIncineration?: string;
    boundaryProcessesDescription?: string;
    exemptedEmissionsPercent?: number;
    exemptedEmissionsDescription?: string;

    secondaryEmissionFactorSources?: string[];
    primaryDataShare?: number;
    technologicalDQR?: number;
    geographicalDQR?: number;
    temporalDQR?: number;

    massBalancingUsed?: boolean;
    massBalancingCertificateScheme?: string;
    freeAttributionInMassBalancing?: "true" | "false";

    ccsTechnologicalCO2CaptureIncluded?: boolean;

    programCertificationShare?: number;
    productVerificationShare1stParty?: number;
    productVerificationShare2ndParty?: number;
    productVerificationShare3rdParty?: number;
    attestation?: {
        link?: string;
        standardName?: string;
        completedAt?: string;
        providerId?: string;
        providerName?: string;
        attestationType?: string;
        attestationStandard?: string;
    };

    pcfId?: string;
    pcfVersion?: number;
    pcfStatus?: PcfStatus;
    retroOrProspectivePcfType?: RetroOrProspective;
    precedingPfIds?: string[];

    comment?: string;

    // ---- 28-question pipeline: detailed computed fields ----
    // When these are present the simple flat *Value fields are ignored for the
    // corresponding sections. Allows the new formula engine to emit fully-typed
    // Catena-X v9 values without duplicating JSON shape logic.
    carbonContentDetail?: {
        biogenicCarbonContent: number;
        fossilCarbonContent: number;
        recycledCarbonContent: number;
        carbonContentTotal: number;
        packagingBiogenicCarbonContent: number;
    };
    productionStageDetail?: StageEmissionsDetail;
    packagingStageDetail?: StageEmissionsDetail & { packagingEmissionsIncluded: boolean };
    distributionStageDetail?: StageEmissionsDetail & { distributionStageIncluded: boolean };
}

export interface StageEmissionsDetail {
    fossilGhgEmissions: number;
    biogenicNonCO2Emissions: number;
    biogenicCO2Uptake: number;
    landUseChangeGhgEmissions: number;
    landManagementBiogenicCO2Emissions: number;
    landManagementBiogenicCO2Removals: number;
    aircraftGhgEmissions: number;
    pcfExcludingBiogenicUptake: number;
    pcfIncludingBiogenicUptake: number;
}

export function buildPcfV9Payload(input: EnviraanPcfInput): Record<string, unknown> {
    const productionStageTotal =
        (input.materialValue ?? 0) +
        (input.productionValue ?? 0) +
        (input.wasteValue ?? 0);
    const packagingTotal = input.packagingValue ?? 0;
    const distributionTotal = input.logisticValue ?? 0;

    const validityStart = input.validityPeriodStart ?? input.referencePeriodStart;
    const validityEnd = input.validityPeriodEnd ?? input.referencePeriodEnd;
    const region = input.geographyRegionOrSubregion ?? deriveRegion(input.geographyCountry);

    return {
        general: [{ comment: input.comment ?? "" }],

        carbonContent: [
            input.carbonContentDetail
                ? {
                      biogenicCarbonContent: input.carbonContentDetail.biogenicCarbonContent,
                      packagingBiogenicCarbonContent: input.carbonContentDetail.packagingBiogenicCarbonContent,
                      recycledCarbonContent: input.carbonContentDetail.recycledCarbonContent,
                      carbonContentTotal: input.carbonContentDetail.carbonContentTotal,
                      fossilCarbonContent: input.carbonContentDetail.fossilCarbonContent,
                  }
                : {
                      biogenicCarbonContent: 0,
                      packagingBiogenicCarbonContent: 0,
                      recycledCarbonContent: 0,
                      carbonContentTotal: input.totalPcfValue,
                      fossilCarbonContent: 0,
                  },
        ],

        attestationOfConformance: input.attestation
            ? [
                  {
                      attestationOfConformanceLink: input.attestation.link ?? "",
                      standardName: input.attestation.standardName ?? "",
                      completedAt: input.attestation.completedAt ?? new Date().toISOString(),
                      attestationOfConformanceId: randomUUID(),
                      providerId: input.attestation.providerId ?? "",
                      attestationType: input.attestation.attestationType ?? "",
                      attestationStandard: input.attestation.attestationStandard ?? "",
                      providerName: input.attestation.providerName ?? "",
                  },
              ]
            : [],

        productLifeCycleStagesAndEmissions: [
            {
                productionStage: [
                    input.productionStageDetail
                        ? {
                              biogenicNonCO2Emissions: input.productionStageDetail.biogenicNonCO2Emissions,
                              landUseChangeGhgEmissions: input.productionStageDetail.landUseChangeGhgEmissions,
                              landManagementBiogenicCO2Removals: input.productionStageDetail.landManagementBiogenicCO2Removals,
                              aircraftGhgEmissions: input.productionStageDetail.aircraftGhgEmissions,
                              landManagementBiogenicCO2Emissions: input.productionStageDetail.landManagementBiogenicCO2Emissions,
                              packagingLandManagementBiogenicCO2Emissions: 0,
                              pcfExcludingBiogenicUptake: input.productionStageDetail.pcfExcludingBiogenicUptake,
                              fossilGhgEmissions: input.productionStageDetail.fossilGhgEmissions,
                              biogenicCO2Uptake: input.productionStageDetail.biogenicCO2Uptake,
                              pcfIncludingBiogenicUptake: input.productionStageDetail.pcfIncludingBiogenicUptake,
                          }
                        : {
                              biogenicNonCO2Emissions: 0,
                              landUseChangeGhgEmissions: 0,
                              landManagementBiogenicCO2Removals: 0,
                              aircraftGhgEmissions: 0,
                              landManagementBiogenicCO2Emissions: 0,
                              packagingLandManagementBiogenicCO2Emissions: 0,
                              pcfExcludingBiogenicUptake: productionStageTotal,
                              fossilGhgEmissions: productionStageTotal,
                              biogenicCO2Uptake: 0,
                              pcfIncludingBiogenicUptake: productionStageTotal,
                          },
                ],
                packagingStage: [
                    input.packagingStageDetail
                        ? {
                              packagingEmissionsIncluded: input.packagingStageDetail.packagingEmissionsIncluded,
                              packagingPcfIncludingBiogenicUptake: input.packagingStageDetail.pcfIncludingBiogenicUptake,
                              packagingBiogenicNonCO2Emissions: input.packagingStageDetail.biogenicNonCO2Emissions,
                              packagingLandManagementBiogenicCO2Emissions: input.packagingStageDetail.landManagementBiogenicCO2Emissions,
                              packagingFossilGhgEmissions: input.packagingStageDetail.fossilGhgEmissions,
                              packagingPcfExcludingBiogenicUptake: input.packagingStageDetail.pcfExcludingBiogenicUptake,
                              packagingBiogenicCO2Uptake: input.packagingStageDetail.biogenicCO2Uptake,
                              packagingLandUseChangeGhgEmissions: input.packagingStageDetail.landUseChangeGhgEmissions,
                              packagingAircraftGhgEmissions: input.packagingStageDetail.aircraftGhgEmissions,
                              packagingLandManagementBiogenicCO2Removals: input.packagingStageDetail.landManagementBiogenicCO2Removals,
                          }
                        : {
                              packagingEmissionsIncluded: packagingTotal > 0,
                              packagingPcfIncludingBiogenicUptake: packagingTotal,
                              packagingBiogenicNonCO2Emissions: 0,
                              packagingLandManagementBiogenicCO2Emissions: 0,
                              packagingFossilGhgEmissions: packagingTotal,
                              packagingPcfExcludingBiogenicUptake: packagingTotal,
                              packagingBiogenicCO2Uptake: 0,
                              packagingLandUseChangeGhgEmissions: 0,
                              packagingAircraftGhgEmissions: 0,
                              packagingLandManagementBiogenicCO2Removals: 0,
                          },
                ],
                distributionStage: [
                    input.distributionStageDetail
                        ? {
                              distributionStageIncluded: input.distributionStageDetail.distributionStageIncluded,
                              distributionStagePcfIncludingBiogenicUptake: input.distributionStageDetail.pcfIncludingBiogenicUptake,
                              distributionStagePcfExcludingBiogenicUptake: input.distributionStageDetail.pcfExcludingBiogenicUptake,
                              distributionStageFossilGhgEmissions: input.distributionStageDetail.fossilGhgEmissions,
                              distributionStageAircraftGhgEmissions: input.distributionStageDetail.aircraftGhgEmissions,
                              distributionStageLandUseChangeGhgEmissions: input.distributionStageDetail.landUseChangeGhgEmissions,
                              distributionStageLandManagementBiogenicCO2Emissions: input.distributionStageDetail.landManagementBiogenicCO2Emissions,
                              distributionStageLandManagementBiogenicCO2Removals: input.distributionStageDetail.landManagementBiogenicCO2Removals,
                              distributionStageBiogenicCO2Uptake: input.distributionStageDetail.biogenicCO2Uptake,
                              distributionStageBiogenicNonCO2Emissions: input.distributionStageDetail.biogenicNonCO2Emissions,
                          }
                        : {
                              distributionStageIncluded:
                                  input.pcfScope === "Cradle-to-grave" && distributionTotal > 0,
                              distributionStagePcfIncludingBiogenicUptake: distributionTotal,
                              distributionStagePcfExcludingBiogenicUptake: distributionTotal,
                              distributionStageFossilGhgEmissions: distributionTotal,
                              distributionStageAircraftGhgEmissions: 0,
                              distributionStageLandUseChangeGhgEmissions: 0,
                              distributionStageLandManagementBiogenicCO2Emissions: 0,
                              distributionStageLandManagementBiogenicCO2Removals: 0,
                              distributionStageBiogenicCO2Uptake: 0,
                              distributionStageBiogenicNonCO2Emissions: 0,
                          },
                ],
            },
        ],

        pcfAssessmentAndMethodology: [
            {
                dataSourcesAndQuality: [
                    {
                        secondaryEmissionFactorSources:
                            input.secondaryEmissionFactorSources ?? ["ecoinvent 3.8"],
                        primaryDataShare: input.primaryDataShare ?? 0,
                        technologicalDQR: input.technologicalDQR ?? 2,
                        geographicalDQR: input.geographicalDQR ?? 2,
                        temporalDQR: input.temporalDQR ?? 2,
                    },
                ],
                pcfMethodology: [
                    {
                        standards: [
                            {
                                crossSectoralStandards:
                                    input.crossSectoralStandards ?? ["ISO 14067"],
                                productOrSectorSpecificRules:
                                    input.productOrSectorSpecificRules ?? [],
                            },
                        ],
                        gwpCharacterizationFactorDetails: [
                            {
                                ipccCharacterizationFactors:
                                    input.ipccCharacterizationFactors ?? "AR5",
                            },
                        ],
                        massBalancingInformation: [
                            {
                                massBalancingCertificateScheme:
                                    input.massBalancingCertificateScheme ?? "Not applicable",
                                massBalancingUsed: input.massBalancingUsed ?? false,
                                freeAttributionInMassBalancing:
                                    input.freeAttributionInMassBalancing ?? "false",
                            },
                        ],
                        allocationInForeground: [
                            {
                                allocationRulesDescription:
                                    "In accordance with Catena-X PCF Rulebook",
                                allocationRecycledCarbon:
                                    input.allocationRecycledCarbon ?? "upstream system expansion",
                                allocationWasteIncineration:
                                    input.allocationWasteIncineration ?? "cut-off",
                            },
                        ],
                    },
                ],
                pcfAssessmentInformation: [
                    {
                        technology: [
                            {
                                ccsTechnologicalCO2CaptureIncluded:
                                    input.ccsTechnologicalCO2CaptureIncluded ?? false,
                                boundaryProcessesDescription:
                                    input.boundaryProcessesDescription ??
                                    "Cradle-to-gate processes including raw materials, production, and packaging.",
                            },
                        ],
                        boundarySpecifications: [
                            {
                                exemptedEmissionsPercent: input.exemptedEmissionsPercent ?? 0,
                                exemptedEmissionsDescription:
                                    input.exemptedEmissionsDescription ?? "No exemption",
                            },
                        ],
                        time: [
                            {
                                referencePeriodStart: input.referencePeriodStart,
                                referencePeriodEnd: input.referencePeriodEnd,
                                validityPeriodStart: validityStart,
                                validityPeriodEnd: validityEnd,
                                created: new Date().toISOString(),
                            },
                        ],
                        geography: [
                            {
                                geographyCountry: input.geographyCountry,
                                geographyCountrySubdivision: input.geographyCountrySubdivision ?? "",
                                geographyRegionOrSubregion: region,
                            },
                        ],
                        idAndVersion: [
                            {
                                id: input.pcfId ?? randomUUID(),
                                version: input.pcfVersion ?? 1,
                                status: input.pcfStatus ?? "Active",
                                retroOrProspectivePcfType:
                                    input.retroOrProspectivePcfType ?? "Retrospective PCF",
                                precedingPfIds: input.precedingPfIds ?? [],
                            },
                        ],
                    },
                ],
                verificationAndCertificationShares: [
                    {
                        programCertificationShare: input.programCertificationShare ?? 0,
                        productVerificationShare1stParty:
                            input.productVerificationShare1stParty ?? 100,
                        productVerificationShare2ndParty:
                            input.productVerificationShare2ndParty ?? 0,
                        productVerificationShare3rdParty:
                            input.productVerificationShare3rdParty ?? 0,
                    },
                ],
            },
        ],

        scopeOfPcfForm: [
            {
                partialFullPcf: input.pcfScope,
                specVersion: PCF_V9_SPEC_VERSION,
            },
        ],

        companyAndProductInformation: [
            {
                productInformation: [
                    {
                        productNameCompany: input.productName,
                        productDescription: input.productDescription ?? input.productName,
                        declaredUnitOfMeasurement: input.declaredUnitOfMeasurement ?? "piece",
                        declaredUnitAmount: input.declaredUnitAmount ?? 1,
                        productMassPerDeclaredUnit: input.productMassKg ?? 0,
                        productIds: [`urn:enviguide.com:product-id:${input.productCode}`],
                        productClassifications: input.productClassifications ?? [],
                    },
                ],
                companyInformation: [
                    {
                        companyName: input.companyName,
                        companyIds: [`urn:${input.companyBpn}`],
                    },
                ],
            },
        ],
    };
}

// Rough country → UN region mapping. Extend as needed; the Catena-X enum lists Africa, Americas, Asia, Europe, Oceania.
function deriveRegion(countryIso2: string): string {
    const asia = ["IN", "CN", "JP", "KR", "SG", "TH", "VN", "ID", "MY", "PH", "BD", "PK", "LK"];
    const europe = ["DE", "FR", "IT", "ES", "NL", "BE", "AT", "CH", "PL", "SE", "NO", "FI", "DK", "GB", "IE", "PT", "GR", "CZ", "HU", "RO"];
    const americas = ["US", "CA", "MX", "BR", "AR", "CL", "CO", "PE"];
    const africa = ["ZA", "EG", "NG", "KE", "MA", "ET"];
    const oceania = ["AU", "NZ"];
    const c = countryIso2.toUpperCase();
    if (asia.includes(c)) return "Asia";
    if (europe.includes(c)) return "Europe";
    if (americas.includes(c)) return "Americas";
    if (africa.includes(c)) return "Africa";
    if (oceania.includes(c)) return "Oceania";
    return "Asia";
}
