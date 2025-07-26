const elements = {
  locationInput: document.getElementById('location'),
  autocomplete: document.getElementById('autocomplete-dropdown'),
  locationError: document.getElementById('location-error'),
  starter: document.getElementById('starter-screen'),
  result: document.getElementById('weather-result'),
  tabs: document.getElementById('tabs'),
  settings: document.getElementById('settings-section'),
  alerts: document.getElementById('alerts-section'),
  now: document.getElementById('now-section'),
  hourly: document.getElementById('hourly-section'),
  sevenDay: document.getElementById('7-day-section'),
  header: document.getElementById('location-name-header'),
  alertsList: document.getElementById('alerts-list'),
  alertsCount: document.getElementById('alerts-count'),
  alertsButton: document.getElementById('alerts-button'),
  settingsButton: document.getElementById('settings-button'),
  loading: document.getElementById('loading'),
  autoLocate: document.getElementById('auto-locate'),
  geolocationMessage: document.getElementById('geolocation-message'),
  clock: document.getElementById('clock'),
  dataTableBody: document.querySelector('#data-table tbody'),
  summaryTableBody: document.getElementById('summary-table-body')
};

const SYNOPTIC_API_TOKEN = '48e30629c07746e58d63b878697916b1';
const SYNOPTIC_API_BASE_URL = 'https://api.synopticdata.com/v2/';
let allObservations = [], allTimestamps = [], currentStationId = null, currentTimezone = 'America/Chicago';
let isSearchActive = true;
const pressureTendencyCodes = { 0: "Rising, then falling", 1: "Rising slowly", 2: "Rising steadily", 3: "Rising quickly", 4: "Steady", 5: "Falling, then rising", 6: "Falling slowly", 7: "Falling steadily", 8: "Falling quickly" };

function getTemperatureColor(tempF) {
  if (!tempF || tempF === 'N/A' || !tempF.includes('°F')) return 'var(--temp-color)';
  const value = parseFloat(tempF.replace('°F', ''));
  if (isNaN(value)) return 'var(--temp-color)';
  const tempPalette = {
    "120–115": "#4e4e4e", "115–110": "#696262", "110–105": "#857373", "105–100": "#a18383",
    "100–95": "#be928e", "95–90": "#da9c84", "90–85": "#e68d6a", "85–80": "#d05742",
    "80–75": "#c44033", "75–70": "#dd693a", "70–65": "#e28a41", "65–60": "#e2a84b",
    "60–55": "#d8bc55", "55–50": "#c6c966", "50–45": "#a6bc64", "45–40": "#7fb167",
    "40–35": "#4b9f8e", "35–30": "#4481b7", "30–25": "#6aa7e3", "25–20": "#96c3e5",
    "20–15": "#c0d0e6", "15–10": "#e0a6d7", "10–5": "#c56eb6", "5–0": "#b03b95",
    "0–-5": "#9c2c8b", "-5–-10": "#8b1c84", "-10–-15": "#832284", "-15–-20": "#8a3390",
    "-20–-25": "#9a55a7", "-25–-30": "#a976bb", "-30–-35": "#b997ca", "-35–-40": "#cdbad9",
    "-40–-45": "#b6d4d9", "-45–-50": "#80cbc5", "-50–-55": "#39a2a1", "-55–-60": "#106377"
  };
  const ranges = Object.keys(tempPalette).map(range => {
    const [max, min] = range.split('–').map(Number);
    return { min, max, color: tempPalette[range] };
  }).sort((a, b) => b.min - a.min);
  for (let range of ranges) {
    if (value >= range.min && value < range.max) return range.color;
  }
  return value >= 120 ? tempPalette["120–115"] : tempPalette["-55–-60"];
}

function formatPrecipitation(value) {
  return !value || value === 'N/A' || isNaN(parseFloat(value)) ? 'N/A' : `${parseFloat(value).toFixed(2)}in`;
}

function updateClock() {
  elements.clock.textContent = luxon.DateTime.now().setZone(currentTimezone).toFormat('h:mm:ss a');
}

function convertToAmericanUnits(observations, variables) {
  const converted = {}, lastNonNullValues = {};
  const excludedVars = ['air_temp_high_6_hour_set_1', 'air_temp_low_6_hour_set_1', 'air_temp_high_24_hour_set_1', 'air_temp_low_24_hour_set_1', 'precip_accum_one_hour_set_1', 'precip_accum_three_hour_set_1', 'precip_accum_six_hour_set_1', 'precip_accum_24_hour_set_1'];
  const unitMap = {
    temperature: ['air_temp_set_1', 'heat_index_set_1d', 'dew_point_temperature_set_1d', 'wet_bulb_temperature_set_1', 'wet_bulb_temp_set_1d', 'air_temp_high_24_hour_set_1', 'air_temp_low_24_hour_set_1'],
    wind: ['wind_speed_set_1', 'wind_gust_set_1'],
    pressure: ['pressure_set_1d', 'sea_level_pressure_set_1d'],
    precip: ['precip_accum', 'precip_accum_24_hour_set_1', 'precip_accum_one_hour_set_1', 'precip_accum_three_hour_set_1', 'precip_accum_six_hour_set_1'],
    visibility: ['visibility_set_1'],
    ceiling: ['ceiling_set_1'],
    altimeter: ['altimeter_set_1'],
    wind_direction: ['wind_direction_set_1', 'peak_wind_direction_set_1'],
    percentage: ['relative_humidity_set_1'],
    text: ['weather_condition_set_1d', 'weather_summary_set_1d', 'wind_cardinal_direction_set_1d', 'pressure_tendency_set_1'],
    peak_wind: ['peak_wind_speed_set_1']
  };

  const convertValue = (v, value) => {
    if (value === null || value === '' || isNaN(parseFloat(value))) return unitMap.text.includes(v) && value ? value : '';
    const num = parseFloat(value);
    if (unitMap.temperature.includes(v)) return `${(num * 9/5 + 32).toFixed(1)}°F`;
    if (unitMap.wind.includes(v)) return `${(num * 2.23694).toFixed(2)}mph`;
    if (unitMap.peak_wind.includes(v)) return `${(num * 2.23694).toFixed(2)}mph`;
    if (v.includes('altimeter')) return `${(num * 0.0002953).toFixed(2)}inHg`;
    if (unitMap.pressure.includes(v)) return `${(num * 0.01).toFixed(2)}mbar`;
    if (unitMap.precip.includes(v)) return formatPrecipitation(num * 0.03937);
    if (v.includes('visibility')) return num >= 10 ? '10.0mi' : `${num.toFixed(1)}mi`;
    if (v.includes('ceiling')) return `${(num * 3.28084).toFixed(0)}ft`;
    if (v.includes('pressure_tendency')) {
      const code = Math.floor(num / 1000), hPaChange = (num % 1000) / 10;
      const sign = code >= 0 && code <= 3 ? '+' : (code >= 5 && code <= 8 ? '-' : '');
      return `${pressureTendencyCodes[code] || 'Unknown'}: ${sign}${hPaChange.toFixed(1)} hPa`;
    }
    if (unitMap.wind_direction.includes(v)) return `${num}°`;
    if (unitMap.percentage.includes(v)) return `${num.toFixed(2)}%`;
    return unitMap.text.includes(v) ? value : num;
  };

  variables.forEach(v => {
    if (!observations[v] || !Array.isArray(observations[v]) || observations[v].length !== allTimestamps.length) {
      if (!excludedVars.includes(v)) converted[v] = Array(allTimestamps.length).fill('');
      return;
    }
    let lastNonNull = null;
    converted[v] = observations[v].map(val => {
      if (val !== null && val !== '' && !isNaN(parseFloat(val))) lastNonNull = val;
      return convertValue(v, val !== null ? val : lastNonNull);
    });
    lastNonNullValues[v] = convertValue(v, lastNonNull || observations[v][observations[v].length - 1]);
  });
  return { converted, lastNonNullValues };
}

function updateSummaryTable(observations) {
  const excludedVars = ['air_temp_high_6_hour_set_1', 'air_temp_low_6_hour_set_1', 'air_temp_high_24_hour_set_1', 'air_temp_low_24_hour_set_1', 'precip_accum_one_hour_set_1', 'precip_accum_three_hour_set_1', 'precip_accum_six_hour_set_1', 'precip_accum_24_hour_set_1'];
  const lastValues = {};
  const labelMap = {
    'air_temp_high_6_hour_set_1': '6 Hour Temperature High: °F',
    'air_temp_low_6_hour_set_1': '6 Hour Temperature Low: °F',
    'air_temp_high_24_hour_set_1': '24 Hour Temperature High: °F',
    'air_temp_low_24_hour_set_1': '24 Hour Temperature Low: °F',
    'precip_accum_one_hour_set_1': 'One Hour Precipitation Accumulation: in',
    'precip_accum_three_hour_set_1': 'Three Hour Precipitation Accumulation: in',
    'precip_accum_six_hour_set_1': 'Six Hour Precipitation Accumulation: in',
    'precip_accum_24_hour_set_1': '24 Hour Precipitation Accumulation: in'
  };
  excludedVars.forEach(v => {
    lastValues[v] = 'N/A';
    if (observations[v]?.length) {
      const value = observations[v].slice().reverse().find(val => val !== null && val !== '' && !isNaN(parseFloat(val)));
      if (value) lastValues[v] = v.includes('air_temp') ? `${(parseFloat(value) * 9/5 + 32).toFixed(1)}°F` : formatPrecipitation(parseFloat(value) * 0.03937);
    }
  });
  elements.summaryTableBody.innerHTML = excludedVars.map(v => {
    const label = labelMap[v] || v.replace('_set_1', '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    const style = v.includes('air_temp') ? `style="color: ${getTemperatureColor(lastValues[v])}"` : v.includes('precip_accum') ? `style="color: var(--precip-color)"` : '';
    return `<tr><td class="border border-gray-200 p-3">${label}</td><td class="font-bold border border-gray-200 p-3" ${style}>${lastValues[v]}</td></tr>`;
  }).join('');
}

function displayStationData(station) {
  if (!station?.OBSERVATIONS?.date_time) {
    elements.dataTableBody.innerHTML = '';
    elements.summaryTableBody.innerHTML = '';
    document.getElementById('data-view-title').textContent = `Station: ${currentStationId || 'Unknown'} | Last Updated: N/A`;
    return;
  }
  allObservations = station.OBSERVATIONS;
  allTimestamps = (allObservations.date_time || []).slice().reverse();
  if (!allTimestamps.length) {
    elements.dataTableBody.innerHTML = '';
    elements.summaryTableBody.innerHTML = '';
    document.getElementById('data-view-title').textContent = `Station: ${currentStationId || 'Unknown'} | Last Updated: N/A`;
    return;
  }
  const variables = Object.keys(allObservations).filter(key => key !== 'date_time' && !/cloud_layer|metar|pressure_change_code|dew_point_temperature_set_1(?!d)|air_temp_high_6_hour_set_1|air_temp_low_6_hour_set_1|air_temp_high_24_hour_set_1|air_temp_low_24_hour_set_1|precip_accum_one_hour_set_1|precip_accum_three_hour_set_1|precip_accum_six_hour_set_1|precip_accum_24_hour_set_1|sea_level_pressure_set_1$|sea_level_pressure_tendency$|weather_cond_code_set_1/.test(key));
  const sortedVariables = ['air_temp_set_1', 'relative_humidity_set_1', 'wind_speed_set_1', 'heat_index_set_1d', 'weather_summary_set_1d', 'wind_cardinal_direction_set_1d', 'wind_gust_set_1', 'visibility_set_1', 'weather_condition_set_1d', 'dew_point_temperature_set_1d', 'ceiling_set_1', 'pressure_set_1d', 'sea_level_pressure_set_1d', 'altimeter_set_1', 'pressure_tendency_set_1', 'wet_bulb_temp_set_1d', 'wind_direction_set_1', 'peak_wind_speed_set_1', 'peak_wind_direction_set_1'].filter(v => variables.includes(v)).concat(variables.filter(v => !['air_temp_set_1', 'relative_humidity_set_1', 'wind_speed_set_1', 'heat_index_set_1d', 'weather_summary_set_1d', 'wind_cardinal_direction_set_1d', 'wind_gust_set_1', 'visibility_set_1', 'weather_condition_set_1d', 'dew_point_temperature_set_1d', 'ceiling_set_1', 'pressure_set_1d', 'sea_level_pressure_set_1d', 'altimeter_set_1', 'pressure_tendency_set_1', 'wet_bulb_temp_set_1d', 'wind_direction_set_1', 'peak_wind_speed_set_1', 'peak_wind_direction_set_1'].includes(v)));
  const filteredObservations = {};
  sortedVariables.forEach(v => filteredObservations[v] = allObservations[v]?.length === allTimestamps.length ? allObservations[v].slice().reverse() : Array(allTimestamps.length).fill(null));
  const { converted: convertedObservations } = convertToAmericanUnits(filteredObservations, sortedVariables);
  document.getElementById('data-view-title').textContent = `Station: ${station.STID} | Last Updated: ${luxon.DateTime.now().setZone(currentTimezone).toFormat('MM/dd/yyyy HH:mm:ss')}`;
  const officialLabels = {
    'air_temp_set_1': 'Air Temperature: °F', 'relative_humidity_set_1': 'Relative Humidity: %', 'wind_speed_set_1': 'Wind Speed: mph', 'heat_index_set_1d': 'Heat Index: °F', 'weather_summary_set_1d': 'Weather Summary', 'wind_cardinal_direction_set_1d': 'Wind Cardinal Direction', 'wind_gust_set_1': 'Wind Gust: mph', 'weather_condition_set_1d': 'Weather Condition', 'dew_point_temperature_set_1d': 'Dew Point Temperature: °F', 'visibility_set_1': 'Visibility: miles', 'ceiling_set_1': 'Ceiling Height: ft', 'pressure_set_1d': 'Station Pressure: mbar', 'sea_level_pressure_set_1d': 'Sea Level Pressure: mbar', 'altimeter_set_1': 'Altimeter Setting: inHg', 'pressure_tendency_set_1': 'Pressure Tendency', 'wet_bulb_temp_set_1d': 'Wet Bulb Temperature: °F', 'wind_direction_set_1': 'Wind Direction: °', 'peak_wind_speed_set_1': 'Peak Wind Speed: mph', 'peak_wind_direction_set_1': 'Peak Wind Direction: °'
  };
  const dataTableHead = document.querySelector('#data-table thead tr');
  dataTableHead.innerHTML = [`<th class="border border-gray-200 p-3 sticky top-0 z-[110] min-w-[110px]">Date and Time</th>`, ...sortedVariables.map(v => `<th class="border border-gray-200 p-3 sticky top-0 z-[100]">${officialLabels[v] || v.replace('_set_1', '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}</th>`)].join('');
  elements.dataTableBody.innerHTML = allTimestamps.map((time, index) => {
    const parsedTime = luxon.DateTime.fromISO(time, { zone: currentTimezone }).toFormat('MM/dd/yyyy h:mm a');
    return `<tr><td class="border border-gray-200 p-3 sticky left-0 z-[90] min-w-[110px] bg-[var(--card-bg)]">${parsedTime}</td>${sortedVariables.map(v => `<td class="border border-gray-200 p-3">${convertedObservations[v][index] || ''}</td>`).join('')}</tr>`;
  }).join('');
  updateSummaryTable(allObservations);
  const tableContainer = document.getElementById('data-table-container');
  tableContainer.style.opacity = '0';
  tableContainer.style.display = 'none';
  setTimeout(() => { tableContainer.style.display = 'block'; tableContainer.style.opacity = '1'; }, 10);
}

async function fetchStationData(stationId, startDate, endDate) {
  if (!stationId) {
    elements.dataTableBody.innerHTML = '';
    elements.summaryTableBody.innerHTML = '';
    document.getElementById('data-view-title').textContent = `Station: Unknown | Last Updated: N/A`;
    return false;
  }
  const formatDate = date => luxon.DateTime.fromJSDate(date).toUTC().toFormat('yyyyMMddHHmm');
  try {
    const response = await $.ajax({ url: `${SYNOPTIC_API_BASE_URL}stations/timeseries?stid=${stationId}&start=${formatDate(startDate)}&end=${formatDate(endDate)}&token=${SYNOPTIC_API_TOKEN}&obtimezone=local`, method: 'GET' });
    if (!response.STATION?.[0]?.OBSERVATIONS?.date_time) {
      elements.dataTableBody.innerHTML = '';
      elements.summaryTableBody.innerHTML = '';
      document.getElementById('data-view-title').textContent = `Station: ${stationId} | Last Updated: N/A`;
      return false;
    }
    currentStationId = response.STATION[0].STID;
    allObservations = response.STATION[0].OBSERVATIONS;
    allTimestamps = (allObservations.date_time || []).slice().reverse();
    displayStationData(response.STATION[0]);
    return true;
  } catch (error) {
    elements.dataTableBody.innerHTML = '';
    elements.summaryTableBody.innerHTML = '';
    document.getElementById('data-view-title').textContent = `Station: ${stationId} | Last Updated: N/A`;
    if (error.status === 429) {
      elements.locationError.textContent = 'Error: Synoptic API rate limit exceeded. Please try again later.';
      elements.locationError.classList.remove('hidden');
    }
    return false;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const API_KEY = '86f857c7c80b4ba3bfe3afdb9fefb393';
  const GEOCODING_API = 'https://api.opencagedata.com/geocode/v1/json';
  const NWS_API = 'https://api.weather.gov';
  let selectedLocation = null, activeAlerts = [];

  const savedTheme = localStorage.getItem('theme') || 'light';
  document.documentElement.setAttribute('data-theme', savedTheme);
  elements.themeToggle = document.getElementById('theme-toggle');
  elements.themeToggle.checked = savedTheme === 'dark';

  elements.starter.classList.remove('hidden');
  elements.result.classList.add('hidden');
  elements.tabs.classList.add('hidden');
  elements.alerts.classList.remove('active');
  elements.settings.classList.remove('active');
  elements.autocomplete.classList.add('hidden');
  elements.locationError.classList.add('hidden');
  elements.loading.classList.add('hidden');
  elements.starter.style.display = 'flex';
  elements.result.style.display = 'none';
  elements.tabs.style.display = 'none';

  setInterval(updateClock, 1000);
  updateClock();

  const getCachedData = (key, ttl = 3600000) => {
    const cached = JSON.parse(localStorage.getItem(key));
    return cached && Date.now() - cached.timestamp < ttl ? cached.data : null;
  };

  const setCachedData = (key, data) => localStorage.setItem(key, JSON.stringify({ data, timestamp: Date.now() }));

  const fetchWithRetry = async (url, retries = 3, delay = 2000) => {
    for (let i = 0; i < retries; i++) {
      try {
        const response = await fetch(url, { headers: { 'User-Agent': 'NWS Weather App', 'accept': 'application/geo+json' } });
        if (response.status === 429) {
          elements.locationError.textContent = 'Warning: API rate limit exceeded. Retrying...';
          elements.locationError.classList.remove('hidden');
          await new Promise(resolve => setTimeout(resolve, delay * (i + 1)));
          continue;
        }
        if (!response.ok) throw new Error(`HTTP error: ${response.status}`);
        return response;
      } catch (error) {
        if (i === retries - 1) throw error;
      }
    }
  };

  const reverseGeocode = async (lat, lng) => {
    const cacheKey = `reverse_${lat.toFixed(4)}_${lng.toFixed(4)}`;
    const cached = getCachedData(cacheKey);
    if (cached) return cached;
    try {
      const response = await fetchWithRetry(`${GEOCODING_API}?q=${lat}+${lng}&key=${API_KEY}&countrycode=US&limit=1`);
      const data = await response.json();
      if (!data.results.length) throw new Error('No geocoding results');
      const result = data.results[0].formatted.replace(/United States of America/, 'U.S.');
      setCachedData(cacheKey, result);
      return result;
    } catch (error) {
      throw error;
    }
  };

  const fetchGeocoding = async (query) => {
    const cacheKey = `geo_${query.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '')}`;
    const cached = getCachedData(cacheKey);
    if (cached) return cached;
    try {
      const response = await fetchWithRetry(`${GEOCODING_API}?q=${encodeURIComponent(query)}&key=${API_KEY}&countrycode=US&limit=5`);
      const data = await response.json();
      if (!data.results.length) throw new Error('No geocoding results');
      const result = { name: data.results[0].formatted.replace(/United States of America/, 'U.S.'), lat: parseFloat(data.results[0].geometry.lat), lng: parseFloat(data.results[0].geometry.lng) };
      setCachedData(cacheKey, result);
      return result;
    } catch (error) {
      if (error.message.includes('429')) {
        console.error('FetchGeocoding Error: Open Cage API calls limit reached');
        elements.locationError.textContent = 'Error: Open Cage API calls limit reached. Please try again later.';
        elements.locationError.classList.remove('hidden');
      }
      throw error;
    }
  };

  const fetchHourlyForecast = async (wfo, gridX, gridY) => {
    const cacheKey = `hourly_${wfo}_${gridX}_${gridY}`;
    let hourlyData = getCachedData(cacheKey);
    if (!hourlyData) {
      try {
        const response = await fetchWithRetry(`${NWS_API}/gridpoints/${wfo}/${gridX},${gridY}/forecast/hourly`);
        hourlyData = await response.json();
        if (!hourlyData.properties?.periods) throw new Error('No hourly forecast data');
        setCachedData(cacheKey, hourlyData);
      } catch (error) {
        hourlyData = { properties: { periods: [] } };
      }
    }
    return hourlyData;
  };

  const fetchSevenDayForecast = async (wfo, gridX, gridY) => {
    const cacheKey = `7day_${wfo}_${gridX}_${gridY}`;
    let forecastData = getCachedData(cacheKey);
    if (!forecastData) {
      try {
        const response = await fetchWithRetry(`${NWS_API}/gridpoints/${wfo}/${gridX},${gridY}/forecast`);
        forecastData = await response.json();
        if (!forecastData.properties?.periods) throw new Error('No 7-day forecast data');
        setCachedData(cacheKey, forecastData);
      } catch (error) {
        forecastData = { properties: { periods: [] } };
      }
    }
    return forecastData;
  };

  const fetchAlerts = async (lat, lng) => {
    try {
      const response = await fetchWithRetry(`${NWS_API}/alerts/active?point=${lat},${lng}`);
      const data = await response.json();
      return data.features || [];
    } catch (error) {
      return [];
    }
  };

  const fetchCurrentConditions = async (stationsUrl) => {
    try {
      const stationsResponse = await fetchWithRetry(stationsUrl);
      const stationsData = await stationsResponse.json();
      if (!stationsData.features?.length) throw new Error('No stations found');
      const stationId = stationsData.features[0].properties.stationIdentifier;
      const obsResponse = await fetchWithRetry(`${NWS_API}/stations/${stationId}/observations/latest`);
      const obsData = await obsResponse.json();
      if (!obsData.properties) throw new Error('No observation data');
      return {
        stationId,
        currentConditions: obsData.properties.textDescription || 'N/A',
        icon: obsData.properties.icon || `${NWS_API}/icons/land/day/skc?size=medium`,
        nwsData: {
          temperature: obsData.properties.temperature?.value != null ? `${Math.round((obsData.properties.temperature.value * 9/5) + 32)}°F` : 'N/A',
          humidity: obsData.properties.relativeHumidity?.value != null ? `${obsData.properties.relativeHumidity.value}%` : 'N/A',
          dewPoint: obsData.properties.dewpoint?.value != null ? `${Math.round((obsData.properties.dewpoint.value * 9/5) + 32)}°F` : 'N/A',
          visibility: obsData.properties.visibility?.value != null ? (obsData.properties.visibility.value / 1609.34 >= 10 ? '10.0mi' : `${(obsData.properties.visibility.value / 1609.34).toFixed(1)}mi`) : 'N/A',
          windSpeed: obsData.properties.windSpeed?.value != null ? `${Math.round((obsData.properties.windSpeed.value * 0.621371))}mph` : 'N/A',
          windDirection: obsData.properties.windDirection?.value != null ? ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round(obsData.properties.windDirection.value / 45) % 8] : 'N/A',
          windGust: obsData.properties.windGust?.value != null ? `${Math.round((obsData.properties.windGust.value * 0.621371))}mph` : 'N/A',
          pressure: obsData.properties.seaLevelPressure?.value != null ? `${(obsData.properties.seaLevelPressure.value / 100).toFixed(2)}mbar` : 'N/A',
          lastUpdated: obsData.properties.timestamp ? new Date(obsData.properties.timestamp).toLocaleString() : 'N/A'
        }
      };
    } catch (error) {
      return { stationId: null, currentConditions: 'N/A', icon: `${NWS_API}/icons/land/day/skc?size=medium`, nwsData: { temperature: 'N/A', humidity: 'N/A', dewPoint: 'N/A', visibility: 'N/A', windSpeed: 'N/A', windDirection: 'N/A', windGust: 'N/A', pressure: 'N/A', lastUpdated: 'N/A' } };
    }
  };

  async function fetchWeather(location, lat, lng, isGeolocation = false) {
    if (!location && !isGeolocation) {
      elements.locationError.textContent = 'Error: Please enter a valid location.';
      elements.locationError.classList.remove('hidden');
      elements.loading.classList.add('hidden');
      elements.starter.classList.remove('hidden');
      elements.starter.style.display = 'flex';
      elements.result.classList.add('hidden');
      elements.result.style.display = 'none';
      elements.tabs.classList.add('hidden');
      elements.tabs.style.display = 'none';
      return;
    }
    elements.locationError.classList.add('hidden');
    elements.loading.classList.remove('hidden');
    elements.loading.style.display = 'flex';
    elements.starter.classList.add('hidden');
    elements.starter.style.display = 'none';
    elements.result.classList.add('hidden');
    elements.result.style.display = 'none';
    elements.tabs.classList.add('hidden');
    elements.tabs.style.display = 'none';

    const timeout = setTimeout(() => {
      elements.loading.classList.add('hidden');
      elements.loading.style.display = 'none';
      elements.locationError.textContent = 'Error: Data fetch timed out. Please try again.';
      elements.locationError.classList.remove('hidden');
      elements.starter.classList.remove('hidden');
      elements.starter.style.display = 'flex';
      elements.result.classList.add('hidden');
      elements.result.style.display = 'none';
      elements.tabs.classList.add('hidden');
      elements.tabs.style.display = 'none';
      isSearchActive = true;
    }, 10000);

    try {
      let locationName;
      if (isGeolocation) {
        locationName = location;
      } else if (selectedLocation?.formatted.replace(/United States of America/, 'U.S.') === location) {
        lat = parseFloat(selectedLocation.geometry.lat);
        lng = parseFloat(selectedLocation.geometry.lng);
        locationName = selectedLocation.formatted.replace(/United States of America/, 'U.S.');
      } else {
        const geoData = await fetchGeocoding(location);
        lat = parseFloat(geoData.lat);
        lng = parseFloat(geoData.lng);
        locationName = geoData.name;
      }
      if (isNaN(lat) || isNaN(lng)) throw new Error('Invalid coordinates');
      lat = Number(lat.toFixed(4));
      lng = Number(lng.toFixed(4));

      const pointsResponse = await fetchWithRetry(`${NWS_API}/points/${lat},${lng}`);
      const pointsData = await pointsResponse.json();
      if (!pointsData.properties) throw new Error('No points data');
      const { observationStations: stationsUrl, gridId: wfo, gridX, gridY, timeZone } = pointsData.properties;
      currentTimezone = timeZone || 'America/Chicago';
      updateClock();

      const { stationId, currentConditions, icon, nwsData } = await fetchCurrentConditions(stationsUrl);
      currentStationId = stationId;

      const endDate = new Date(), startDate = new Date(endDate.getTime() - 3 * 24 * 60 * 60 * 1000);
      const synopticSuccess = await fetchStationData(stationId, startDate, endDate);
      let displayData = nwsData, lastUpdated = nwsData.lastUpdated;
      if (synopticSuccess && allObservations && allTimestamps.length) {
        const variables = ['air_temp_set_1', 'relative_humidity_set_1', 'heat_index_set_1d', 'dew_point_temperature_set_1d', 'visibility_set_1', 'wind_speed_set_1', 'wind_cardinal_direction_set_1d', 'wind_gust_set_1', 'pressure_set_1d', 'precip_accum_24_hour_set_1', 'air_temp_high_24_hour_set_1', 'air_temp_low_24_hour_set_1'];
        const { lastNonNullValues } = convertToAmericanUnits(allObservations, variables);
        displayData = {
          temperature: lastNonNullValues['air_temp_set_1'] || nwsData.temperature,
          humidity: lastNonNullValues['relative_humidity_set_1'] || nwsData.humidity,
          feelsLike: lastNonNullValues['heat_index_set_1d'] || 'N/A',
          dewPoint: lastNonNullValues['dew_point_temperature_set_1d'] || nwsData.dewPoint,
          visibility: lastNonNullValues['visibility_set_1'] || nwsData.visibility,
          windSpeed: lastNonNullValues['wind_speed_set_1'] || nwsData.windSpeed,
          windDirection: lastNonNullValues['wind_cardinal_direction_set_1d'] || nwsData.windDirection,
          windGust: lastNonNullValues['wind_gust_set_1'] || nwsData.windGust,
          pressure: lastNonNullValues['pressure_set_1d'] || nwsData.pressure,
          precip24Hour: lastNonNullValues['precip_accum_24_hour_set_1'] || 'N/A',
          tempHigh24Hour: lastNonNullValues['air_temp_high_24_hour_set_1'] || 'N/A',
          tempLow24Hour: lastNonNullValues['air_temp_low_24_hour_set_1'] || 'N/A',
          lastUpdated: allTimestamps[0] ? luxon.DateTime.fromISO(allTimestamps[0], { zone: currentTimezone }).toFormat('MM/dd/yyyy h:mm a') : nwsData.lastUpdated
        };
        lastUpdated = displayData.lastUpdated;
      } else {
        displayData = { ...nwsData, feelsLike: 'N/A', precip24Hour: 'N/A', tempHigh24Hour: 'N/A', tempLow24Hour: 'N/A' };
      }

      const hourlyData = await fetchHourlyForecast(wfo, gridX, gridY);
      activeAlerts = await fetchAlerts(lat, lng);
      const forecastData = await fetchSevenDayForecast(wfo, gridX, gridY);
      const periods = forecastData.properties.periods;

      elements.header.textContent = locationName;
      elements.now.innerHTML = `
        <div class="weather-card full-width">
          <div class="text-center">
            <p class="text-6xl font-extrabold temp-color" style="color: ${getTemperatureColor(displayData.temperature)}">${displayData.temperature}</p>
            <p class="text-2xl font-semibold mt-2">${currentConditions}</p>
            <img src="${icon}" alt="${currentConditions}" class="mx-auto w-64 h-64 mt-4">
          </div>
          <div class="grid grid-cols-2 gap-4 mt-6">
            <div class="bg-card p-6 rounded-lg shadow">
              <p class="text-xl mb-4">Feels Like: <span style="color: ${getTemperatureColor(displayData.feelsLike)}">${displayData.feelsLike}</span></p>
              <p class="text-xl mb-4">Humidity: <span style="color: var(--humidity-color)">${displayData.humidity}</span></p>
              <p class="text-xl mb-4">Dew Point: <span style="color: var(--dewpoint-color)">${displayData.dewPoint}</span></p>
              <p class="text-xl">Wind: <span style="color: var(--wind-color)">${displayData.windSpeed}</span> <span style="color: var(--wind-direction-color)">${displayData.windDirection}</span></p>
            </div>
            <div class="bg-card p-6 rounded-lg shadow">
              <p class="text-xl mb-4">Pressure: <span style="color: var(--pressure-color)">${displayData.pressure}</span></p>
              <p class="text-xl mb-4">24hr Precip: <span style="color: var(--precip-color)">${displayData.precip24Hour}</span></p>
              <p class="text-xl mb-4">24hr High: <span style="color: ${getTemperatureColor(displayData.tempHigh24Hour)}">${displayData.tempHigh24Hour}</span></p>
              <p class="text-xl">24hr Low: <span style="color: ${getTemperatureColor(displayData.tempLow24Hour)}">${displayData.tempLow24Hour}</span></p>
            </div>
          </div>
          <div class="bg-card p-6 rounded-lg shadow mt-6">
            <p class="text-xl">Last Updated: <span>${lastUpdated}</span></p>
            <p class="text-lg text-gray-500 mt-2" style="color: var(--text-color)">Coordinates: ${lat.toFixed(4)}, ${lng.toFixed(4)}</p>
          </div>
        </div>
      `;
      elements.hourly.innerHTML = '';
      const now = new Date(), twentyFourHoursLater = new Date(now.getTime() + 24 * 60 * 60 * 1000);
      const hourlyPeriods = hourlyData.properties.periods.filter(period => {
        const periodTime = new Date(period.startTime);
        return periodTime >= now && periodTime <= twentyFourHoursLater;
      }).slice(0, 24);
      if (hourlyPeriods.length === 0) {
        elements.hourly.innerHTML = '<p class="text-center text-gray-500">No hourly forecast data available.</p>';
      } else {
        hourlyPeriods.forEach(period => {
          const timeStr = new Date(period.startTime).toLocaleTimeString([], { hour: 'numeric', hour12: true });
          const tempF = period.temperatureUnit === 'F' ? `${period.temperature}°F` : `${Math.round((period.temperature * 9/5) + 32)}°F`;
          const chanceOfRain = period.probabilityOfPrecipitation?.value != null ? `${period.probabilityOfPrecipitation.value}%` : 'N/A';
          const dewPoint = period.dewpoint?.value != null ? `${Math.round((period.dewpoint.value * 9/5) + 32)}°F` : 'N/A';
          const humidity = period.relativeHumidity?.value != null ? `${period.relativeHumidity.value}%` : 'N/A';
          const wind = period.windSpeed && period.windDirection ? `${period.windSpeed} ${period.windDirection}` : 'N/A';
          elements.hourly.insertAdjacentHTML('beforeend', `
            <div class="hour-row" data-expanded="false">
              <div class="hour-main">
                <div class="hour-time">${timeStr}</div>
                <img src="${period.icon || `${NWS_API}/icons/land/day/skc?size=medium`}" alt="${period.shortForecast || 'Clear'}" class="hour-image">
                <div class="hour-condition">${period.shortForecast || 'N/A'}</div>
                <div class="hour-temp" style="color: ${getTemperatureColor(tempF)}">${tempF}</div>
                <div class="hour-wind" style="color: var(--wind-color)">${wind}</div>
              </div>
              <div class="hour-details">
                <span style="color: var(--precip-color)">Precipitation Chance: ${chanceOfRain}</span>
                <span style="color: var(--humidity-color)">Humidity: ${humidity}</span>
                <span style="color: var(--dewpoint-color)">Dew Point: ${dewPoint}</span>
              </div>
              <span class="hour-arrow">></span>
            </div>
          `);
        });
      }
      document.querySelectorAll('.hour-row').forEach(row => {
        row.addEventListener('click', () => {
          const isExpanded = row.getAttribute('data-expanded') === 'true';
          row.setAttribute('data-expanded', !isExpanded);
          const details = row.querySelector('.hour-details');
          details.classList.toggle('active', !isExpanded);
        });
      });
      elements.sevenDay.innerHTML = '';
      const today = luxon.DateTime.now().setZone(currentTimezone).startOf('day');
      const currentHour = luxon.DateTime.now().setZone(currentTimezone).hour;
      const dailyPeriods = [];
      let currentDay = null;
      periods.forEach(period => {
        const periodDate = luxon.DateTime.fromISO(period.startTime, { zone: currentTimezone }).startOf('day').toISODate();
        if (!currentDay || currentDay.date !== periodDate) {
          currentDay = { date: periodDate, day: null, night: null };
          dailyPeriods.push(currentDay);
        }
        if (period.isDaytime) {
          currentDay.day = period;
        } else {
          currentDay.night = period;
        }
      });
      if (dailyPeriods.length === 0) {
        elements.sevenDay.innerHTML = '<p class="text-center text-gray-500">No 7-day forecast data available.</p>';
      } else {
        dailyPeriods.forEach((dayPeriod, index) => {
          const isToday = dayPeriod.date === today.toISODate();
          const showDay = !isToday || (isToday && currentHour < 18 && dayPeriod.day);
          const dayName = luxon.DateTime.fromISO(dayPeriod.date, { zone: currentTimezone }).toFormat('EEEE, MMM d');
          const dayData = dayPeriod.day || {};
          const nightData = dayPeriod.night || {};
          const dayTemp = dayData.temperature ? (dayData.temperatureUnit === 'F' ? `${dayData.temperature}°F` : `${Math.round((dayData.temperature * 9/5) + 32)}°F`) : 'N/A';
          const nightTemp = nightData.temperature ? (nightData.temperatureUnit === 'F' ? `${nightData.temperature}°F` : `${Math.round((nightData.temperature * 9/5) + 32)}°F`) : 'N/A';
          const dayPrecip = dayData.probabilityOfPrecipitation?.value != null ? `${dayData.probabilityOfPrecipitation.value}%` : 'N/A';
          const nightPrecip = nightData.probabilityOfPrecipitation?.value != null ? `${nightData.probabilityOfPrecipitation.value}%` : 'N/A';
          const dayWind = dayData.windSpeed && dayData.windDirection ? `${dayData.windSpeed} ${dayData.windDirection}` : 'N/A';
          const nightWind = nightData.windSpeed && nightData.windDirection ? `${nightData.windSpeed} ${dayData.windDirection}` : 'N/A';
          const dayForecast = dayData.shortForecast || 'N/A';
          const nightForecast = nightData.shortForecast || 'N/A';
          const dayDetailed = dayData.detailedForecast || 'N/A';
          const nightDetailed = nightData.detailedForecast || 'N/A';
          const dayIcon = dayData.icon || `${NWS_API}/icons/land/day/skc?size=medium`;
          const nightIcon = nightData.icon || `${NWS_API}/icons/land/night/skc?size=medium`;
          const nightClass = showDay ? 'day-item' : 'day-item full-width';
          elements.sevenDay.insertAdjacentHTML('beforeend', `
            <div class="day-row">
              <h3 class="day-title">${dayName}</h3>
              <div class="day-night-container">
                ${showDay ? `
                  <div class="day-item">
                    <p class="font-medium">Day</p>
                    <img src="${dayIcon}" alt="${dayForecast}" class="mt-2">
                    <p>Temp: <span class="temp-color" style="color: ${getTemperatureColor(dayTemp)}">${dayTemp}</span></p>
                    <p>Precip: <span style="color: var(--precip-color)">${dayPrecip}</span></p>
                    <p>Wind: <span style="color: var(--wind-color)">${dayWind}</span></p>
                    <p>${dayForecast}</p>
                    <p class="detailed-forecast">${dayDetailed}</p>
                  </div>
                ` : ''}
                <div class="${nightClass}">
                  <p class="font-medium">Night</p>
                  <img src="${nightIcon}" alt="${nightForecast}" class="mt-2">
                  <p>Temp: <span class="temp-color" style="color: ${getTemperatureColor(nightTemp)}">${nightTemp}</span></p>
                  <p>Precip: <span style="color: var(--precip-color)">${nightPrecip}</span></p>
                  <p>Wind: <span style="color: var(--wind-color)">${nightWind}</span></p>
                  <p>${nightForecast}</p>
                  <p class="detailed-forecast">${nightDetailed}</p>
                </div>
              </div>
            </div>
          `);
        });
      }
      elements.alertsCount.textContent = activeAlerts.length;
      elements.alertsCount.classList.toggle('hidden', activeAlerts.length === 0);
      elements.alertsButton.classList.remove('hidden');
      elements.alertsList.innerHTML = activeAlerts.length ? activeAlerts.map((alert, index) => `
        <div class="alert-item" data-alert-index="${index}">
          <p class="alert-title" data-alert-index="${index}">
            <span>${alert.properties.headline || alert.properties.event || 'Alert'}</span>
          </p>
          <p class="alert-description" id="alert-description-${index}">${alert.properties.description || 'No description available.'}</p>
        </div>
      `).join('') : '<p class="p-2 text-gray-600">No active alerts.</p>';

      document.querySelectorAll('.tab-button').forEach(btn => btn.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
      const nowTab = document.querySelector('[data-tab="now"]');
      if (nowTab) nowTab.classList.add('active');
      elements.now.classList.add('active');

      clearTimeout(timeout);
      elements.loading.classList.add('hidden');
      elements.loading.style.display = 'none';
      elements.starter.classList.add('hidden');
      elements.starter.style.display = 'none';
      elements.result.classList.remove('hidden');
      elements.result.style.display = 'block';
      elements.result.style.zIndex = '10';
      elements.tabs.classList.remove('hidden');
      elements.tabs.style.display = 'flex';
      elements.tabs.style.zIndex = '30';
      setTimeout(() => {
        elements.result.style.opacity = '1';
        elements.tabs.style.opacity = '1';
        elements.starter.style.opacity = '0';
      }, 10);
      isSearchActive = false;
    } catch (e) {
      clearTimeout(timeout);
      elements.loading.classList.add('hidden');
      elements.loading.style.display = 'none';
      elements.locationError.textContent = e.message.includes('rate limit') ? 'Error: API rate limit exceeded. Please try again later.' : `Error: Failed to fetch weather data. Please try again.`;
      elements.locationError.classList.remove('hidden');
      elements.starter.classList.remove('hidden');
      elements.starter.style.display = 'flex';
      elements.result.classList.add('hidden');
      elements.result.style.display = 'none';
      elements.tabs.classList.add('hidden');
      elements.tabs.style.display = 'none';
      isSearchActive = true;
    }
  }

  const debounce = (func, wait) => {
    let timeout;
    return (...args) => {
      clearTimeout(timeout);
      timeout = setTimeout(() => func(...args), wait);
    };
  };

  const updateAutocomplete = debounce(async (query) => {
    if (!query || query.length < 3) {
      elements.autocomplete.classList.add('hidden');
      return;
    }
    elements.autocomplete.classList.remove('hidden');
    elements.autocomplete.innerHTML = '<div class="autocomplete-item">Searching...</div>';
    try {
      const cacheKey = `geo_${query.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '')}`;
      let data;
      if (getCachedData(cacheKey)) {
        data = { results: [{ formatted: getCachedData(cacheKey).name, geometry: { lat: getCachedData(cacheKey).lat, lng: getCachedData(cacheKey).lng } }] };
      } else {
        const response = await fetchWithRetry(`${GEOCODING_API}?q=${encodeURIComponent(query)}&key=${API_KEY}&countrycode=US&limit=5`);
        data = await response.json();
      }
      elements.autocomplete.innerHTML = data.results.length ? data.results.map(result => `
        <div class="autocomplete-item" data-lat="${result.geometry.lat}" data-lng="${result.geometry.lng}" data-name="${result.formatted.replace(/United States of America/, 'U.S.')}">
          ${result.formatted.replace(/United States of America/, 'U.S.')}
        </div>
      `).join('') : '<div class="autocomplete-item">No results found</div>';
    } catch (error) {
      elements.autocomplete.innerHTML = '<div class="autocomplete-item">Error fetching suggestions</div>';
      if (error.message.includes('429')) {
        console.error('Autocomplete Error: Open Cage API calls limit reached');
        elements.locationError.textContent = 'Error: Open Cage API calls limit reached. Please try again later.';
        elements.locationError.classList.remove('hidden');
      }
    }
  }, 300);

  elements.locationInput.addEventListener('input', (e) => updateAutocomplete(e.target.value.trim()));
  elements.locationInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && elements.locationInput.value.trim()) {
      elements.autocomplete.classList.add('hidden');
      fetchWeather(elements.locationInput.value.trim());
    }
  });

  document.addEventListener('click', (e) => {
    const item = e.target.closest('.autocomplete-item');
    if (item) {
      const lat = parseFloat(item.dataset.lat), lng = parseFloat(item.dataset.lng), name = item.dataset.name;
      if (isNaN(lat) || isNaN(lng)) {
        elements.locationError.textContent = 'Error: Invalid location coordinates.';
        elements.locationError.classList.remove('hidden');
        return;
      }
      selectedLocation = { geometry: { lat, lng }, formatted: name };
      elements.locationInput.value = name;
      elements.autocomplete.classList.add('hidden');
      fetchWeather(name, lat, lng);
    }
  });

  elements.header.addEventListener('click', () => {
    elements.starter.classList.remove('hidden');
    elements.starter.style.display = 'flex';
    elements.starter.style.opacity = '1';
    elements.result.classList.add('hidden');
    elements.result.style.display = 'none';
    elements.result.style.opacity = '0';
    elements.tabs.classList.add('hidden');
    elements.tabs.style.display = 'none';
    elements.tabs.style.opacity = '0';
    elements.alerts.classList.remove('active');
    elements.settings.classList.remove('active');
    elements.locationInput.value = '';
    elements.locationInput.focus();
    elements.autocomplete.classList.add('hidden');
    elements.locationError.classList.add('hidden');
    elements.loading.classList.add('hidden');
    elements.loading.style.display = 'none';
    isSearchActive = true;
  });

  document.querySelectorAll('.tab-button').forEach(button => {
    button.addEventListener('click', () => {
      document.querySelectorAll('.tab-button').forEach(btn => btn.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.remove('active');
        content.style.display = 'none';
      });
      button.classList.add('active');
      const tabSection = document.getElementById(`${button.dataset.tab}-section`);
      if (tabSection) {
        tabSection.classList.add('active');
        tabSection.style.display = 'block';
        tabSection.style.opacity = '0';
        setTimeout(() => { tabSection.style.opacity = '1'; }, 10);
      }
    });
  });

  elements.alertsList.addEventListener('click', (e) => {
    const title = e.target.closest('.alert-title');
    if (title) {
      document.getElementById(`alert-description-${title.dataset.alertIndex}`).classList.toggle('active');
    }
  });

  elements.alertsButton.addEventListener('click', () => {
    elements.alerts.classList.add('active');
    elements.result.classList.add('hidden');
    elements.result.style.display = 'none';
    elements.tabs.classList.add('hidden');
    elements.tabs.style.display = 'none';
    elements.starter.classList.add('hidden');
    elements.starter.style.display = 'none';
    elements.loading.classList.add('hidden');
    elements.loading.style.display = 'none';
  });

  elements.settingsButton.addEventListener('click', () => {
    elements.settings.classList.add('active');
    elements.result.classList.add('hidden');
    elements.result.style.display = 'none';
    elements.tabs.classList.add('hidden');
    elements.tabs.style.display = 'none';
    elements.starter.classList.add('hidden');
    elements.starter.style.display = 'none';
    elements.loading.classList.add('hidden');
    elements.loading.style.display = 'none';
  });

  document.querySelectorAll('.back-button').forEach(button => {
    button.addEventListener('click', () => {
      elements.alerts.classList.remove('active');
      elements.settings.classList.remove('active');
      if (isSearchActive) {
        elements.starter.classList.remove('hidden');
        elements.starter.style.display = 'flex';
        elements.starter.style.opacity = '1';
        elements.result.classList.add('hidden');
        elements.result.style.display = 'none';
        elements.tabs.classList.add('hidden');
        elements.tabs.style.display = 'none';
        elements.loading.classList.add('hidden');
        elements.loading.style.display = 'none';
      } else {
        elements.result.classList.remove('hidden');
        elements.result.style.display = 'block';
        elements.tabs.classList.remove('hidden');
        elements.tabs.style.display = 'flex';
        elements.starter.classList.add('hidden');
        elements.starter.style.display = 'none';
        elements.loading.classList.add('hidden');
        elements.loading.style.display = 'none';
        document.querySelectorAll('.tab-button').forEach(btn => btn.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(content => {
          content.classList.remove('active');
          content.style.display = 'none';
        });
        const nowTab = document.querySelector('[data-tab="now"]');
        if (nowTab) nowTab.classList.add('active');
        elements.now.classList.add('active');
        elements.now.style.display = 'block';
        elements.now.style.opacity = '0';
        setTimeout(() => { elements.now.style.opacity = '1'; }, 10);
      }
    });
  });

  elements.themeToggle.addEventListener('change', (e) => {
    const theme = e.target.checked ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  });

  elements.autoLocate.addEventListener('click', () => {
    if (!navigator.geolocation) {
      console.error('Geolocation Error: Geolocation services denied by browser');
      elements.locationError.textContent = 'Error: Geolocation services denied by browser.';
      elements.locationError.classList.remove('hidden');
      return;
    }
    elements.geolocationMessage.classList.remove('hidden');
    elements.locationError.classList.add('hidden');
    elements.loading.classList.remove('hidden');
    elements.loading.style.display = 'flex';
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;
        try {
          const locationName = await reverseGeocode(latitude, longitude);
          elements.locationInput.value = locationName;
          elements.geolocationMessage.classList.add('hidden');
          fetchWeather(locationName, latitude, longitude, true);
        } catch (error) {
          elements.geolocationMessage.classList.add('hidden');
          elements.loading.classList.add('hidden');
          elements.loading.style.display = 'none';
          elements.locationError.textContent = error.message.includes('rate limit') ? 'Error: API rate limit exceeded. Please try again later.' : `Error: ${error.message}`;
          elements.locationError.classList.remove('hidden');
        }
      },
      (error) => {
        console.error('Geolocation Error: Geolocation services denied by browser');
        elements.geolocationMessage.classList.add('hidden');
        elements.loading.classList.add('hidden');
        elements.loading.style.display = 'none';
        elements.locationError.textContent = 'Error: Geolocation services denied by browser';
        elements.locationError.classList.remove('hidden');
      }
    );
  });
});
