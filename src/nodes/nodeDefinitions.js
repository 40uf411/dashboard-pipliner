const deepClone = (value) => JSON.parse(JSON.stringify(value ?? {}))

export const NODE_SECTIONS = [
  {
    key: 'input',
    title: 'Input',
    items: ['input-dataset'],
  },
  {
    key: 'processing',
    title: 'Processing',
    items: ['processing-concat', 'processing-segmentation', 'processing-filter'],
  },
  {
    key: 'analytics',
    title: 'Analytics',
    items: ['analytics-structural', 'analytics-simulation'],
  },
  {
    key: 'output',
    title: 'Output',
    items: ['output-figure', 'output-log'],
  },
]

const METRIC_OPTIONS = [
  { value: 'lineal_path', label: 'Lineal path' },
  { value: 'cord_length', label: 'Cord length' },
  { value: 'connectivity', label: 'Connectivity' },
  { value: 'pore_size_distribution', label: 'Pore size distribution' },
  { value: 'two_point_correlation', label: 'Two point correlation' },
]

const DIRECTION_OPTIONS = [
  { value: 'X', label: 'X' },
  { value: 'Y', label: 'Y' },
  { value: 'Z', label: 'Z' },
]

export const NODE_TEMPLATES = {
  'input-dataset': {
    key: 'input-dataset',
    kind: 'dataset',
    category: 'input',
    title: 'Input',
    subtitle: 'Dataset',
    body: 'Source dataset',
    color: 'green',
    targets: 0,
    sources: 1,
    editable: true,
    preview: {
      description: 'Provides a dataset from a file or folder.',
      takes: '',
      returns: 'dataset',
    },
    defaultParams: {
      sourceType: 'file',
      datasetFormat: 'PNG/JPEG',
      phase: 'binary',
      maxSamples: 100,
    },
    fields: [
      {
        name: 'sourceType',
        label: 'Source type',
        type: 'select',
        options: [
          { value: 'file', label: 'File' },
          { value: 'folder', label: 'Folder' },
        ],
      },
      {
        name: 'datasetFormat',
        label: 'Dataset type',
        type: 'select',
        options: [
          { value: 'PNG/JPEG', label: 'PNG/JPEG' },
          { value: 'TIFF/TIF', label: 'TIFF/TIF' },
          { value: 'NPY/NPZ', label: 'NPY/NPZ' },
        ],
        isDisabled: (values) => values.sourceType !== 'folder',
        shouldShow: () => true,
        help: 'Enabled when Source type is set to Folder.',
      },
      {
        name: 'phase',
        label: 'Phase',
        type: 'select',
        options: [
          { value: 'binary', label: 'Binary' },
          { value: 'multi-phase', label: 'Multi-phase' },
        ],
      },
      {
        name: 'maxSamples',
        label: 'Max samples to load',
        type: 'number',
        min: 1,
        step: 1,
      },
    ],
  },
  'processing-concat': {
    key: 'processing-concat',
    kind: 'concat',
    category: 'processing',
    title: 'Processing',
    subtitle: 'Concat',
    body: 'Combine inputs',
    color: 'violet',
    targets: 2,
    sources: 1,
    editable: false,
    preview: {
      description: 'Concatenate two datasets into one.',
      takes: 'dataset A, dataset B',
      returns: 'dataset',
    },
    defaultParams: {},
    fields: [],
  },
  'processing-segmentation': {
    key: 'processing-segmentation',
    kind: 'segmentation',
    category: 'processing',
    title: 'Processing',
    subtitle: 'Segmentation',
    body: 'Image segmentation',
    color: 'violet',
    targets: 1,
    sources: 1,
    editable: true,
    preview: {
      description: 'Segments an image/volume using a selected algorithm.',
      takes: 'dataset',
      returns: 'segmented dataset',
    },
    defaultParams: {
      method: 'otsu',
      expDefinition: '',
    },
    fields: [
      {
        name: 'method',
        label: 'Segmentation type',
        type: 'select',
        options: [
          { value: 'otsu', label: 'Otsu' },
          { value: 'EXP', label: 'EXP' },
        ],
      },
      {
        name: 'expDefinition',
        label: 'EXP definition',
        type: 'textarea',
        placeholder: '$p = 2; if $p > 0\n$p = 0; if $p < 0',
        shouldShow: (values) => values.method === 'EXP',
        help: 'Describe each condition on a separate line using the $p placeholder.',
      },
    ],
  },
  'processing-filter': {
    key: 'processing-filter',
    kind: 'filter',
    category: 'processing',
    title: 'Processing',
    subtitle: 'Filter',
    body: 'Signal filtering',
    color: 'violet',
    targets: 1,
    sources: 1,
    editable: true,
    preview: {
      description: 'Applies a configurable filter with kernel size.',
      takes: 'dataset',
      returns: 'filtered dataset',
    },
    defaultParams: {
      filterType: 'mean',
      kernelSize: 3,
      kernelValues: '',
    },
    fields: [
      {
        name: 'filterType',
        label: 'Filter type',
        type: 'select',
        options: [
          { value: 'mean', label: 'Mean' },
          { value: 'median', label: 'Median' },
          { value: 'gaussian', label: 'Gaussian' },
          { value: 'custom', label: 'Custom' },
        ],
      },
      {
        name: 'kernelSize',
        label: 'Kernel size',
        type: 'number',
        min: 1,
        step: 1,
      },
      {
        name: 'kernelValues',
        label: 'Kernel values',
        type: 'textarea',
        placeholder: 'Comma-separated values...',
        isDisabled: (values) => values.filterType !== 'custom',
        help: 'Provide custom kernel entries separated by commas when the filter type is Custom.',
      },
    ],
  },
  'analytics-structural': {
    key: 'analytics-structural',
    kind: 'structural-descriptor',
    category: 'analytics',
    title: 'Analytics',
    subtitle: 'Structural Descriptor',
    body: 'Compute descriptors',
    color: 'red',
    targets: 1,
    sources: 1,
    editable: true,
    preview: {
      description: 'Computes structural descriptors for selected phases/directions.',
      takes: 'dataset',
      returns: 'descriptors',
    },
    defaultParams: {
      metrics: ['lineal_path', 'connectivity'],
      pixelValues: [0, 1],
      directions: ['X'],
      lagDistance: 5,
      step: 1,
    },
    fields: [
      {
        name: 'metrics',
        label: 'Descriptors',
        type: 'checkbox-group',
        options: METRIC_OPTIONS,
      },
      {
        name: 'pixelValues',
        label: 'Pixel values',
        type: 'multi-number',
        min: 0,
        step: 1,
        help: 'Add the pixel intensity values to evaluate; remove any entry with the close button.',
      },
      {
        name: 'directions',
        label: 'Direction',
        type: 'checkbox-group',
        options: DIRECTION_OPTIONS,
      },
      {
        name: 'lagDistance',
        label: 'Lag distance',
        type: 'number',
        min: 0,
        step: 1,
      },
      {
        name: 'step',
        label: 'Step',
        type: 'range',
        min: 1,
        max: 10,
        step: 1,
      },
    ],
  },
  'analytics-simulation': {
    key: 'analytics-simulation',
    kind: 'simulation',
    category: 'analytics',
    title: 'Analytics',
    subtitle: 'Simulation',
    body: 'Run simulations',
    color: 'red',
    targets: 1,
    sources: 1,
    editable: true,
    preview: {
      description: 'Runs a simulation over the input data.',
      takes: 'dataset',
      returns: 'results',
    },
    defaultParams: {
      simulationType: 'Diffusivity',
    },
    fields: [
      {
        name: 'simulationType',
        label: 'Simulation type',
        type: 'select',
        options: [
          { value: 'Diffusivity', label: 'Diffusivity' },
          { value: 'Permeability', label: 'Permeability' },
        ],
      },
    ],
  },
  'output-figure': {
    key: 'output-figure',
    kind: 'figure',
    category: 'output',
    title: 'Output',
    subtitle: 'Figure Vis',
    body: 'Visualize results',
    color: 'azure',
    targets: 1,
    sources: 0,
    editable: false,
    preview: {
      description: 'Visualizes results as plots/figures.',
      takes: 'dataset',
      returns: '',
    },
    defaultParams: {},
    fields: [],
  },
  'output-log': {
    key: 'output-log',
    kind: 'text',
    category: 'output',
    title: 'Output',
    subtitle: 'Text Log',
    body: 'Console/log output',
    color: 'azure',
    targets: 1,
    sources: 0,
    editable: false,
    preview: {
      description: 'Logs textual output for inspection.',
      takes: 'dataset',
      returns: '',
    },
    defaultParams: {},
    fields: [],
  },
}

export const getNodeTemplate = (templateKey) => NODE_TEMPLATES[templateKey]

export const createNodeData = (templateKey, overrides = {}) => {
  const template = getNodeTemplate(templateKey)
  if (!template) throw new Error(`Unknown node template: ${templateKey}`)
  return {
    title: template.title,
    subtitle: template.subtitle,
    body: template.body,
    color: template.color,
    targets: template.targets,
    sources: template.sources,
    templateKey,
    kind: template.kind,
    params: deepClone(template.defaultParams),
    ...overrides,
  }
}

const findOptionLabel = (options = [], value) => {
  const entry = options.find((opt) => opt.value === value)
  return entry ? entry.label : value
}

export const getParamEntries = (templateKey, params = {}) => {
  const template = getNodeTemplate(templateKey)
  if (!template || !Array.isArray(template.fields) || !template.fields.length) return []
  const entries = []
  template.fields.forEach((field) => {
    const values = params
    const shouldShow = typeof field.shouldShow === 'function' ? field.shouldShow(values) : true
    if (!shouldShow) return
    const isDisabled = typeof field.isDisabled === 'function' ? field.isDisabled(values) : false
    const rawValue = values[field.name]
    if (rawValue === undefined || rawValue === null || rawValue === '' || (Array.isArray(rawValue) && !rawValue.length)) {
      if (isDisabled) return
    }
    let formatted = rawValue
    if (field.type === 'checkbox-group') {
      const arr = Array.isArray(rawValue) ? rawValue : []
      formatted = arr.map((val) => findOptionLabel(field.options || [], val)).join(', ')
    } else if (field.type === 'multi-number') {
      const arr = Array.isArray(rawValue) ? rawValue : []
      formatted = arr.join(', ')
    } else if (field.options) {
      formatted = findOptionLabel(field.options, rawValue)
    } else if (typeof rawValue === 'string' && field.type === 'textarea') {
      formatted = rawValue.replace(/\r?\n/g, '; ')
    }
    if (formatted === undefined || formatted === null || formatted === '') return
    entries.push({ key: field.label, value: formatted })
  })
  return entries
}
