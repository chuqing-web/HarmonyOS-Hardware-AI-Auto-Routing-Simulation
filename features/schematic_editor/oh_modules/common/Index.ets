export { EventBus } from './src/main/ets/utils/EventBus';

export {
  mapJsonReplacer, mapJsonReviver, mapAwareStringify, mapAwareParse,
  serializeMap, deserializeStringMap
} from './src/main/ets/utils/MapJsonUtil';

export { MinHeap } from './src/main/ets/utils/MinHeap';

export { RandomUtil } from './src/main/ets/utils/RandomUtil';

export { HexParser } from './src/main/ets/utils/HexParser';

export { CryptoUtil } from './src/main/ets/utils/CryptoUtil';

export { IdUtil } from './src/main/ets/utils/IdUtil';

export { parsePinRef, buildPinRef, getPinNetMap, findNetForPinLabel, ParsedPinRef } from './src/main/ets/utils/PinRefUtil';

export {
  ensureNetPinConnectivity, rebuildAllNetPinConnectivity, summarizeNetPins,
  PinGeometryResolver, PinGeometry
} from './src/main/ets/utils/NetPinRebuildUtil';

export {
  applyNetLabelConnectivity, isAutoNetLabelText, isPowerRailLabelText,
  isGroundLabelText, isPowerSupplyLabelText, normalizePowerLabelFlags,
  canonicalizeRailLabelText, mergeNetInto, labelCopperTouchTol, snapLabelsOntoCopper
} from './src/main/ets/utils/NetLabelConnectivity';

export {
  rebuildWireNetTopology, computeTopoJunctionRadius, computeTopoTJunctionTol
} from './src/main/ets/utils/WireNetTopology';

export {
  INSTR_TRACE_TAG, INSTR_TRACE_SIM_STEP, setInstrTraceSimStep,
  formatPinNetMap, formatBindingSummary, formatWaveSummary, formatVoltageSample, formatCurrentSample,
  traceBindingRefresh, traceActiveComponent, traceActiveComponentChanged, traceReloadSchematic, traceSimStep,
  traceCaptureWave, traceUiRefresh, traceUiSelect, traceInstrUi, traceLoadSchematic, tracePinNetEmpty, traceMeasure,
  traceAnalogOpSummary, traceNetConnectivity,
  traceAnalogDeviceStamp, traceAnalogNetlistSummary, AnalogResistorStamp,
  traceDataFlow, traceCanvasInfo, traceComponentLayout, traceWireTopology, traceNetPinDetail,
  traceDigitalLogic, traceDigitalAd, traceDigitalAdSnapshot, traceCd4017,
  traceDigitalThevenin, traceLogicAnalyzerChannels, traceLaCapture, traceLaUiChannels,
  traceUnconnectedComponents, traceInstrumentInventory, traceConnectionPointSimData,
  traceSpiceNodeMap, traceSimGlobalSnapshot, traceProjectOpenAudit, traceSimStartupAudit,
  traceTopologyHealthCheck, tracePinMultiNetConflicts, traceWireEndpointCollisions,
  traceComponentPinNets, traceResistorDividerCheck, traceInstrumentWiringIssues, traceNetVoltageResolve,
  tracePerPinConnectivity, traceInstrumentMeasureModel,
  traceErcErrorList,
  traceBurn, formatHexInfoSummary, traceBurnHexInfo, formatFirmwarePreview,
  traceUart, formatUartBytesHex, traceUartTxDrain,
  traceMcuTick, traceMcuGpioSync, traceLedVfSample, traceSwitchSample, traceRelaySample,
  traceInteractiveInstrumentLive, InteractiveMeterSnap,
  BindingTraceInfo,
  traceAiPayload, traceAiOp, traceAiDiag, traceAiStage,
  traceAiWireDraw, traceAiWireFix, traceAiWireInventory,
  traceWireConnectBegin, traceWirePinSnap, traceWirePinSnapReject,
  traceWireSnapMissNearCopper,
  traceWireConnectEnd, traceWireConnectPinAudit, traceWirePinRowShort,
  isTraceAutoSignalNetName, traceTopoNetNameScan, traceTopoNetInheritDecision,
  traceTopoSignalAssignSummary, traceTopoWireNetReassign, traceNetEnsureCreate,
  traceWireSnapEndpointDecision, traceWireWireMerge, traceWirePinAttach,
  tracePinPinMerge, traceCompMoveWireFollow, traceWireEndpointNudge
} from './src/main/ets/utils/InstrumentTraceLog';

export {
  detectInstrumentKind, isInstrumentLibraryId,
  instrumentSubTabForKind, instrumentSubTabForLibraryId
} from './src/main/ets/utils/InstrumentKindUtil';

export { ErcEngine } from './src/main/ets/utils/ErcEngine';

export { AiErcGateUtil } from './src/main/ets/utils/AiErcGateUtil';

export {
  DeviceHitGeometry, SELECTION_HIT_PAD, WIRE_OBSTACLE_PAD, FOREIGN_PIN_CLEARANCE,
  WorldHitRect, WirePathCoverage, LabelPlaceHints, NetLabelAnchorInfo
} from './src/main/ets/utils/DeviceHitGeometry';

export { WireConflictGeometry } from './src/main/ets/utils/WireConflictGeometry';

export {
  WireAutoRouter, WarCompObstacle, WarRouteContext, WirePathPreviewResult
} from './src/main/ets/utils/WireAutoRouter';

export { WarRouteOrder, WarOrderPin } from './src/main/ets/utils/WarRouteOrder';

export { DeepErcEngine } from './src/main/ets/utils/DeepErcEngine';

export { DynamicErcEngine } from './src/main/ets/utils/DynamicErcEngine';

export { UnitParser } from './src/main/ets/utils/UnitParser';

export { ExportPostProcessor } from './src/main/ets/utils/ExportPostProcessor';

export { PerformanceOptimizer } from './src/main/ets/utils/PerformanceOptimizer';

export { MainThreadYield } from './src/main/ets/utils/MainThreadYield';

export { Validate } from './src/main/ets/utils/Validate';

export { Logger } from './src/main/ets/utils/Logger';

export { APP_VERSION_NAME, APP_VERSION_CODE, appVersionLabel } from './src/main/ets/utils/AppVersion';

export { ResultHelper, ApiResult } from './src/main/ets/utils/ResultHelper';

export { TopologyAdapter } from './src/main/ets/utils/TopologyAdapter';

export {
  calcSymbolBounds, coverOriginCenteredBody, pointInSymbolBounds, resolveSymbolKey, SymbolBounds
} from './src/main/ets/utils/SymbolGeometry';

export { CallbackRegistry } from './src/main/ets/utils/CallbackRegistry';

export {
  copyStringMap, copyNumberMap, ensureStringMap, paramMapGet, parseVoltageVolts, appendArray, arrayMin, arrayMax,
  arrayBufferToString, normalizeRotation, copySchTopologyWithDevices,
  emptyStringMap, emptyNumberMap, stringMap1, stringMap2,
  makeDeviceInst, makeDeviceRequirement, makeRouteLine, emptySchTopology
} from './src/main/ets/utils/MapHelpers';

export { HardwareFingerprint } from './src/main/ets/security/HardwareFingerprint';

export { LicenseManager } from './src/main/ets/security/LicenseManager';

export { FeatureGate } from './src/main/ets/security/FeatureGate';

export { TrialManager, TrialStatus } from './src/main/ets/security/TrialManager';

export { PrivacyConsentStore, PrivacyConsentRecord } from './src/main/ets/security/PrivacyConsentStore';

export { Mcu8051Engine, Mcu8051State } from './src/main/ets/engines/Mcu8051Engine';

export { TopologyPatchApplier, TopologyPatch, TopologyPatchOp } from './src/main/ets/utils/TopologyPatch';

export { AiContextSanitizer } from './src/main/ets/utils/AiContextSanitizer';



export { ErrCode, errCodeMessage } from './src/main/ets/types/ErrCode';

export { ProgressInfo, ProgressCallback, makeProgress } from './src/main/ets/types/ProgressTypes';

export {

  NetNodeRef, NetInfo, DeviceInst, NetLabelInfo, BusInfo, ProbeInfo, TextAnnotate,

  ErcError, SubCircuitBlock, SubCircuitPort, SchTopology, RouteLine, RouteResult, SpacingIssue

} from './src/main/ets/types/TopologyTypes';

export {

  SimConfig, WaveData, FreqNoiseData, SimStatResult, SpiceResult, defaultSimConfig

} from './src/main/ets/types/SimExtendedTypes';

export {

  AiTaskType, DiagError, AiTaskResult, AiTestResult, BomOptResult,

  LibDevicePin, SimModelInfo, ParamLimit, LibDevice,

  DeviceRequirement, DeviceSelectLlmOutput, MatchedDevice, DeviceSelectResult,

  LayoutConstraintRule, LayoutLlmOutput, LayoutPositionItem, PlacementCandidate, PlacementResult,

  NetPriorityRule, SpecialNetRule, RoutingLlmOutput, RoutingWeightPrefs, AiPipelineResult,

  DevicePosition,

  ClarificationQuestion, ClarificationAnswer, RequirementSpec, RequirementPowerSpec,
  emptyRequirementSpec

} from './src/main/ets/types/AiExtendedTypes';

export {

  DeviceModelType, DeviceParamValue, DevicePinMeta, DeviceMeta,

  DeviceIndexEntry, DeviceLibraryIndex, ProteusMappingEntry, ProteusMappingIndex,

  McuSimModel, LoadedDeviceBundle

} from './src/main/ets/types/DeviceLibraryTypes';

export { FlashSegment, HexFileInfo } from './src/main/ets/types/HexExtendedTypes';

export {

  OscTimebase, OscVoltageScale, CouplingMode, TriggerMode, CaptureMode, MathChannelOp,

  OscilloscopeConfig, CursorMeasurement, LogicDecodeProtocol, LogicAnalyzerConfig,

  DecodedFrame, MultimeterMode, SignalWaveform, SignalGenConfig, UartTerminalConfig,

  VoltmeterType, VoltmeterConfig, AmmeterType, AmmeterConfig,

  PowerMeterConfig, FrequencyCounterConfig, InstrumentSnapshot

} from './src/main/ets/types/InstrumentTypes';

export { FaultType, FaultInjection, FaultScanResult } from './src/main/ets/types/FaultTypes';

export {

  PluginPermission, PluginType, PluginInfo, PluginManifest

} from './src/main/ets/types/PluginTypes';

export {

  LicenseTier, LicenseFeatures, LicenseFile, LicenseStatus,

  ApiUsageRecord, UsageDashboard

} from './src/main/ets/types/LicenseTypes';

export {

  SchematicAnnotationType, SchematicAnnotationStatus, AnnotationTargetKind,

  SchematicAnnotation, SnapshotMeta, TopologySnapshotDiff, VersionCompareReport,

  CollabChangeLogEntry, ProjectAccessMode, ProjectLockInfo, CollaborationData

} from './src/main/ets/types/CollaborationTypes';

export {

  ProjectSnapshot, VersionDiff, ChangeLogEntry, PrintConfig, Annotation,

  AccessibilityConfig, ProxyConfig, HotUpdateInfo, LengthUnit

} from './src/main/ets/types/PlatformTypes';



export {

  Point2D,

  Rect2D,

  WorldRect,

  Rotation,

  ViewportState,

  PinType,

  NetType,

  LogicState,

  BusWidth,

  WireStyle,

  Pin,

  Net,

  NetLabel,

  Wire,

  Port,

  ComponentCategory,

  ComponentInstance,

  SchematicDocument,

  SubcircuitRef,

  SchematicMetadata,

  ProbeMeta,

  SimulationMode,

  SimulationState,

  SimulationConfig,

  SimulationResult,

  McuRegisterSnapshot,

  McuFamily,

  DebugState,

  HexFirmware,

  HexSegment,

  McuDebugConfig,

  AiCapability,

  AiProviderType,

  LoadBalanceMode,

  ApiConnectionStatus,

  AiApiConfig,

  AiRequest,

  AiResponse,

  FileFormat,

  ProjectFile,

  ErcSeverity,

  ErcRuleType,

  ErcViolation,

  ModuleEvent,

  ModuleEventPayload,

  ModuleEventHandler,

  Result,

  PaginatedResult

} from './src/main/ets/types/CommonTypes';

export {
  PcbLayerId, PcbPadShape, PcbPadType, PcbViaKind, PcbAppearanceMode, Pcb3dDisplayMode, PcbRouteCornerMode, PcbStackLayerType,
  PcbPad, PcbFootprintDef, PcbFootprintInst,
  PcbTrack, PcbVia, PcbZone, PcbBoardOutline, PcbLayerConfig, PcbMetadata,
  PcbDesignRules, PcbDocument, PcbDrcSeverity, PcbDrcRuleType, PcbDrcViolation,
  PcbNet, PcbNetClass, PcbDiffPair, PcbStackLayer, PcbLayerStack, PcbAppearance,
  PcbRatsnestEdge,
  defaultPcbDesignRules, defaultPcbNetClasses, defaultPcbAppearance, normalizePcbAppearance,
  createDefaultPcbLayers, createDefaultLayerStack, createEmptyPcbDocument, createDefaultPcbViewport,
  normalizePcbDocument, applyCopperLayerCount, isCopperLayer, copperLayersFromStack,
  PcbNetRef, PcbPadNetPreserved, PcbPadHit,
  PcbEditorSelectionData, PcbSelectionKind, PcbSelectionState, PcbSelectionRect,
  PcbHistorySnapshot, pcbSelectionEmpty, pcbSelectionFromData
} from './src/main/ets/types/PcbTypes';

export { PcbFootprintLibrary, getGlobalPcbFootprintLibrary } from './src/main/ets/utils/PcbFootprintLibrary';

export { PcbForwardAnnotator, ForwardAnnotateResult, forwardAnnotatePcb } from './src/main/ets/utils/PcbForwardAnnotator';

export { ReverseAnnotateResult, reverseAnnotatePcb } from './src/main/ets/utils/PcbReverseAnnotator';

export { GerberLayerFile, GerberExportResult, exportPcbGerber } from './src/main/ets/utils/PcbGerberExporter';

export { KiCadPcbExportResult, exportPcbKiCad } from './src/main/ets/utils/PcbKiCadExporter';

export { autoRoutePcb, AutoRouteResult, rerouteNets, RerouteResult } from './src/main/ets/utils/PcbAutoRouter';

export {
  registerSchPinToPadNet, lookupPadNet, registerPadNetKey
} from './src/main/ets/utils/PcbPinBindUtil';

export {
  tracePcb, tracePcbWarn, tracePcbUi, tracePcbOp, tracePcb3d,
  tracePcbForwardResult, tracePcbAutoRoute,
  tracePcbManualRoute, tracePcbManualRouteReject, tracePcbTrackAdded,
  tracePcbDrc, tracePcbSchCompare, tracePcbNetRoutingSummary, tracePcbReverseResult,
  tracePcbFullState, tracePcbPinConnectivity, tracePcbCanvasRealtime, PcbCanvasTraceSnapshot,
  tracePcbLayoutCrowd, tracePcbView2dAudit, tracePcbView3dAudit, tracePcbDisplayDump,
  PcbView2dTraceParams, PcbView3dTraceParams
} from './src/main/ets/utils/PcbTraceLog';

export {
  collectFootprintPadPositions, updateTracksForFootprintTransform,
  updateTracksForFootprintTransformDetailed, syncMovedTrackJunctions,
  collectNetIdsForFootprints, snapTrackEndpointsToPads, snapTrackEndpointsNearFootprints,
  orderPointsNearestNeighbor, padSnapTolerance, junctionMatchTolerance,
  pcbPadPosKey, TrackFollowResult, TrackEndpointSnapshot
} from './src/main/ets/utils/PcbTrackBindUtil';

export {
  padWorldPosition, rebuildZoneCutouts, pointInPolygon, makeRectCutout,
  thermalSpokeRects, ThermalSpokeRect, normalizeZoneFields, defaultZoneFields
} from './src/main/ets/utils/PcbZoneUtil';

export {
  rebuildPcbNets, buildRatsnest, routeLPoints, routeOrtho45Points, routeArcPoints, routeByCornerMode,
  findNetClass, guessNetClassId, sumTrackLengthForNet
} from './src/main/ets/utils/PcbNetUtil';

export {
  buildTrackPolylines, polylineJointPoints, PcbTrackPolyline
} from './src/main/ets/utils/PcbTrackChainUtil';

export {
  PcbSpatialIndex, PcbSpatialItem, PcbSpatialKind, PcbSpatialRect
} from './src/main/ets/utils/PcbSpatialIndex';

export {
  polylineLength, addSerpentineMeander, matchDiffPairLengths
} from './src/main/ets/utils/PcbSerpentineUtil';

