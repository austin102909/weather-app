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

const SYNOPTIC_API_TOKEN = '81ebbb6ea61247ac85cb88a96d97fcf2';
const SYNOPTIC_API_BASE_URL = 'https://api.synopticdata.com/v2/';
const NWS_API = 'https://api.weather.gov';
let allObservations = [], allTimestamps = [], currentStationId = null, currentTimezone = 'America/Chicago';
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
  return ranges[ranges.length - 1].color;
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
    wind: ['wind_speed_set_1', 'wind_gust_set_1', 'peak_wind_speed_set_1'],
    pressure: ['pressure_set_1d', 'sea_level_pressure_set_1d'],
    precip: ['precip_accum', 'precip_accum_24_hour_set_1', 'precip_accum_one_hour_set_1', 'precip_accum_three_hour_set_1', 'precip_accum_six_hour_set_1'],
    visibility: ['visibility_set_1'],
    ceiling: ['ceiling_set_1'],
    altimeter: ['altimeter_set_1'],
    wind_direction: ['wind_direction_set_1', 'peak_wind_direction_set_1'],
    percentage: ['relative_humidity_set_1'],
    text: ['weather_condition_set_1d', 'weather_summary_set_1d', 'wind_cardinal_direction_set_1d', 'pressure_tendency_set_1']
  };

  const convertValue = (v, value) => {
    if (value === null || value === '' || isNaN(parseFloat(value))) return unitMap.text.includes(v) && value ? value : '';
    const num = parseFloat(value);
    if (unitMap.temperature.includes(v)) return `${(num * 9/5 + 32).toFixed(1)}°F`;
    if (unitMap.wind.includes(v)) return `${(num * 2.23694).toFixed(2)}mph`;
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
  document.getElementById('data-view-title').textContent = `Station: ${station.STID} | Last Updated: ${luxon.DateTime.fromISO(allTimestamps[0], { zone: currentTimezone }).toFormat('MM/dd/yyyy HH:mm:ss')}`;
  const officialLabels = {
    'air_temp_set_1': 'Air Temperature: °F', 'relative_humidity_set_1': 'Relative Humidity: %', 'wind_speed_set_1': 'Wind Speed: mph', 'heat_index_set_1d': 'Heat Index: °F', 'weather_summary_set_1d': 'Weather Summary', 'wind_cardinal_direction_set_1d': 'Wind Cardinal Direction', 'wind_gust_set_1': 'Wind Gust: mph', 'weather_condition_set_1d': 'Weather Condition', 'dew_point_temperature_set_1d': 'Dew Point Temperature: °F', 'visibility_set_1': 'Visibility: miles', 'ceiling_set_1': 'Ceiling Height: ft', 'pressure_set_1d': 'Station Pressure: mbar', 'sea_level_pressure_set_1d': 'Sea Level Pressure: mbar', 'altimeter_set_1': 'Altimeter Setting: inHg', 'pressure_tendency_set_1': 'Pressure Tendency', 'wet_bulb_temp_set_1d': 'Wet Bulb Temperature: °F', 'wind_direction_set_1': 'Wind Direction: °', 'peak_wind_speed_set_1': 'Peak Wind Speed: mph', 'peak_wind_direction_set_1': 'Peak Wind Direction: °'
  };
  const dataTableHead = document.querySelector('#data-table thead tr');
  dataTableHead.innerHTML = [`<th class="border border-gray-200 p-3 bg-gray-800 text-white sticky top-0 z-[110] min-w-[110px]">Date and Time</th>`, ...sortedVariables.map(v => `<th class="border border-gray-200 p-3 bg-gray-800 text-white sticky top-0 z-[100]">${officialLabels[v] || v.replace('_set_1', '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}</th>`)].join('');
  elements.dataTableBody.innerHTML = allTimestamps.slice(0, 72).map((time, index) => {
    const parsedTime = luxon.DateTime.fromISO(time, { zone: currentTimezone }).toFormat('MM/dd/yyyy h:mm a');
    return `<tr><td class="border border-gray-200 p-3 sticky left-0 z-[90] min-w-[110px] bg-[var(--card-bg)]">${parsedTime}</td>${sortedVariables.map(v => `<td class="border border-gray-200 p-3">${convertedObservations[v][index] || ''}</td>`).join('')}</tr>`;
  }).join('');
  updateSummaryTable(allObservations);
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
    console.error('FetchStationData Error:', error.message, error.status);
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
          elements.locationError.textContent = 'Error: API rate limit exceeded. Please try again later.';
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
    const response = await fetchWithRetry(`${GEOCODING_API}?q=${lat}+${lng}&key=${API_KEY}&countrycode=US&limit=1`);
    const data = await response.json();
    if (!data.results.length) throw new Error('No geocoding results');
    const result = data.results[0].formatted.replace(/United States of America/, 'U.S.');
    setCachedData(cacheKey, result);
    return result;
  };

  const fetchWeather = async (lat, lng) => {
    elements.loading.classList.remove('hidden');
    try {
      const pointsResponse = await fetchWithRetry(`${NWS_API}/commits/master/points/${lat},${lng}`);
      const pointsData = await pointsResponse.json();
      const { forecastHourly, forecast, observationStations } = pointsData.properties;
      currentTimezone = pointsData.properties.timeZone;

      const [hourlyResponse, forecastResponse, stationsResponse] = await Promise.all([
        fetchWithRetry(forecastHourly),
        fetchWithRetry(forecast),
        fetchWithRetry(observationStations)
      ]);

      const [hourlyData, forecastData, stationsData] = await Promise.all([
        hourlyResponse.json(),
        forecastResponse.json(),
        stationsResponse.json()
      ]);

      const stationId = stationsData.features[0].properties.stationIdentifier;
      const endDate = new Date(), startDate = new Date(endDate.getTime() - 3 * 24 * 60 * 60 * 1000);
      await fetchStationData(stationId, startDate, endDate);

      const displayData = allObservations ? {
        temperature: convertToAmericanUnits({ air_temp_set_1: [allObservations.air_temp_set_1?.[0]] }, ['air_temp_set_1']).converted.air_temp_set_1[0] || 'N/A',
        feelsLike: convertToAmericanUnits({ heat_index_set_1d: [allObservations.heat_index_set_1d?.[0]] }, ['heat_index_set_1d']).converted.heat_index_set_1d[0] || 'N/A',
        humidity: convertToAmericanUnits({ relative_humidity_set_1: [allObservations.relative_humidity_set_1?.[0]] }, ['relative_humidity_set_1']).converted.relative_humidity_set_1[0] || 'N/A',
        dewPoint: convertToAmericanUnits({ dew_point_temperature_set_1d: [allObservations.dew_point_temperature_set_1d?.[0]] }, ['dew_point_temperature_set_1d']).converted.dew_point_temperature_set_1d[0] || 'N/A',
        windSpeed: convertToAmericanUnits({ wind_speed_set_1: [allObservations.wind_speed_set_1?.[0]] }, ['wind_speed_set_1']).converted.wind_speed_set_1[0] || 'N/A',
        windDirection: convertToAmericanUnits({ wind_cardinal_direction_set_1d: [allObservations.wind_cardinal_direction_set_1d?.[0]] }, ['wind_cardinal_direction_set_1d']).converted.wind_cardinal_direction_set_1d[0] || 'N/A',
        pressure: convertToAmericanUnits({ sea_level_pressure_set_1d: [allObservations.sea_level_pressure_set_1d?.[0]] }, ['sea_level_pressure_set_1d']).converted.sea_level_pressure_set_1d[0] || 'N/A',
        precip24Hour: convertToAmericanUnits({ precip_accum_24_hour_set_1: [allObservations.precip_accum_24_hour_set_1?.[0]] }, ['precip_accum_24_hour_set_1']).converted.precip_accum_24_hour_set_1[0] || 'N/A',
        tempHigh24Hour: convertToAmericanUnits({ air_temp_high_24_hour_set_1: [allObservations.air_temp_high_24_hour_set_1?.[0]] }, ['air_temp_high_24_hour_set_1']).converted.air_temp_high_24_hour_set_1[0] || 'N/A',
        tempLow24Hour: convertToAmericanUnits({ air_temp_low_24_hour_set_1: [allObservations.air_temp_low_24_hour_set_1?.[0]] }, ['air_temp_low_24_hour_set_1']).converted.air_temp_low_24_hour_set_1[0] || 'N/A'
      } : {};

      const currentConditions = hourlyData.properties.periods[0].shortForecast || 'N/A';
      const icon = hourlyData.properties.periods[0].icon || `${NWS_API}/icons/land/day/skc?size=medium`;
      const lastUpdated = allTimestamps?.[0] ? luxon.DateTime.fromISO(allTimestamps[0], { zone: currentTimezone }).toFormat('MM/dd/yyyy h:mm a') : 'N/A';

      elements.now.innerHTML = `
        <div class="weather-card">
          <div class="bg-card p-6 rounded-lg shadow text-center">
            <p class="text-6xl font-extrabold temp-color" style="color: ${getTemperatureColor(displayData.temperature)}">${displayData.temperature}</p>
            <p class="text-2xl font-semibold mt-4">${currentConditions}</p>
            <img src="${icon}" alt="${currentConditions}" class="w-300 h-300 mt-6 mx-auto">
          </div>
          <div class="grid grid-cols-2 gap-6 mt-6">
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

      const hourlyPeriods = hourlyData.properties.periods.slice(0, 7);
      elements.hourly.innerHTML = `
        <div class="hour-top-row">${hourlyPeriods.slice(0, 3).map(p => `
          <div class="hour-cell">
            <p>${luxon.DateTime.fromISO(p.startTime, { zone: currentTimezone }).toFormat('h a')}</p>
            <img src="${p.icon}" alt="${p.shortForecast}">
            <p class="temp-color" style="color: ${getTemperatureColor(`${p.temperature}°F`)}">${p.temperature}°F</p>
            <p>${p.shortForecast}</p>
          </div>`).join('')}</div>
        <div class="hour-bottom-row">${hourlyPeriods.slice(3, 7).map(p => `
          <div class="hour-cell additional">
            <p>${luxon.DateTime.fromISO(p.startTime, { zone: currentTimezone }).toFormat('h a')}</p>
            <img src="${p.icon}" alt="${p.shortForecast}">
            <p class="temp-color" style="color: ${getTemperatureColor(`${p.temperature}°F`)}">${p.temperature}°F</p>
            <p>${p.shortForecast}</p>
          </div>`).join('')}</div>
      `;

      const periods = forecastData.properties.periods;
      const forecastByDay = {};
      periods.forEach(period => {
        const periodDate = luxon.DateTime.fromISO(period.startTime, { zone: currentTimezone }).startOf('day').toISODate();
        if (!forecastByDay[periodDate]) forecastByDay[periodDate] = { day: null, night: null };
        if (period.isDaytime) forecastByDay[periodDate].day = period;
        else forecastByDay[periodDate].night = period;
      });

      elements.sevenDay.innerHTML = '';
      Object.keys(forecastByDay).forEach(date => {
        const dayForecast = forecastByDay[date].day;
        const nightForecast = forecastByDay[date].night;
        const dayHtml = dayForecast ? `
          <div class="day-item day-forecast">
            <p class="font-medium">${luxon.DateTime.fromISO(dayForecast.startTime, { zone: currentTimezone }).toFormat('EEEE')} Day</p>
            <img src="${dayForecast.icon || `${NWS_API}/icons/land/day/skc?size=medium`}" alt="${dayForecast.shortForecast || 'Clear'}" class="mt-2">
            <p>Temp: <span class="temp-color" style="color: ${getTemperatureColor(`${dayForecast.temperature}°F`)}">${dayForecast.temperature}°F</span></p>
            <p>Precip: <span style="color: var(--precip-color)">${dayForecast.probabilityOfPrecipitation?.value != null ? `${dayForecast.probabilityOfPrecipitation.value}%` : 'N/A'}</span></p>
            <p>Wind: <span style="color: var(--wind-color)">${dayForecast.windSpeed && dayForecast.windDirection ? `${dayForecast.windSpeed} ${dayForecast.windDirection}` : 'N/A'}</span></p>
            <p>${dayForecast.shortForecast || 'N/A'}</p>
            <p class="detailed-forecast">${dayForecast.detailedForecast || 'N/A'}</p>
          </div>
        ` : '<div class="day-item day-forecast"><p>No Day Data</p></div>';
        const nightHtml = nightForecast ? `
          <div class="day-item night-forecast">
            <p class="font-medium">${luxon.DateTime.fromISO(nightForecast.startTime, { zone: currentTimezone }).toFormat('EEEE')} Night</p>
            <img src="${nightForecast.icon || `${NWS_API}/icons/land/night/skc?size=medium`}" alt="${nightForecast.shortForecast || 'Clear'}" class="mt-2">
            <p>Temp: <span class="temp-color" style="color: ${getTemperatureColor(`${nightForecast.temperature}°F`)}">${nightForecast.temperature}°F</span></p>
            <p>Precip: <span style="color: var(--precip-color)">${nightForecast.probabilityOfPrecipitation?.value != null ? `${nightForecast.probabilityOfPrecipitation.value}%` : 'N/A'}</span></p>
            <p>Wind: <span style="color: var(--wind-color)">${nightForecast.windSpeed && nightForecast.windDirection ? `${nightForecast.windSpeed} ${nightForecast.windDirection}` : 'N/A'}</span></p>
            <p>${nightForecast.shortForecast || 'N/A'}</p>
            <p class="detailed-forecast">${nightForecast.detailedForecast || 'N/A'}</p>
          </div>
        ` : '<div class="day-item night-forecast"><p>No Night Data</p></div>';
        elements.sevenDay.insertAdjacentHTML('beforeend', `<div class="forecast-row">${dayHtml}${nightHtml}</div>`);
      });

      const locationName = await reverseGeocode(lat, lng);
      elements.header.textContent = locationName;
      elements.starter.classList.add('hidden');
      elements.result.classList.remove('hidden');
      elements.tabs.classList.remove('hidden');
    } catch (error) {
      console.error('FetchWeather Error:', error);
      elements.locationError.textContent = 'Error fetching weather data. Please try again.';
      elements.locationError.classList.remove('hidden');
    } finally {
      elements.loading.classList.add('hidden');
    }
  };

  elements.themeToggle.addEventListener('change', () => {
    const newTheme = elements.themeToggle.checked ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
  });

  elements.autoLocate.addEventListener('click', () => {
    navigator.geolocation.getCurrentPosition(
      position => fetchWeather(position.coords.latitude, position.coords.longitude),
      error => {
        elements.geolocationMessage.textContent = 'Geolocation failed. Please enter a location manually.';
        elements.geolocationMessage.classList.remove('hidden');
      }
    );
  });

  elements.locationInput.addEventListener('input', async () => {
    const query = elements.locationInput.value.trim();
    if (query.length < 3) {
      elements.autocomplete.classList.add('hidden');
      return;
    }
    const response = await fetch(`${GEOCODING_API}?q=${encodeURIComponent(query)}&key=${API_KEY}&countrycode=US&limit=5`);
    const data = await response.json();
    elements.autocomplete.innerHTML = data.results.map(result => `<li class="p-2 cursor-pointer hover:bg-gray-200" data-lat="${result.geometry.lat}" data-lng="${result.geometry.lng}">${result.formatted}</li>`).join('');
    elements.autocomplete.classList.remove('hidden');
  });

  elements.autocomplete.addEventListener('click', e => {
    if (e.target.tagName === 'LI') {
      const lat = e.target.dataset.lat;
      const lng = e.target.dataset.lng;
      elements.locationInput.value = e.target.textContent;
      elements.autocomplete.classList.add('hidden');
      fetchWeather(lat, lng);
    }
  });
});
