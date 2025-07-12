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
  clock: document.getElementById('clock')
};

const SYNOPTIC_API_TOKEN = '81ebbb6ea61247ac85cb88a96d97fcf2';
const SYNOPTIC_API_BASE_URL = 'https://api.synopticdata.com/v2/';
let allObservations = [], allTimestamps = [], currentStationId = null, currentTimezone = 'America/Chicago';
const pressureTendencyCodes = {
  0: "Rising, then falling",
  1: "Rising slowly",
  2: "Rising steadily",
  3: "Rising quickly",
  4: "Steady",
  5: "Falling, then rising",
  6: "Falling slowly",
  7: "Falling steadily",
  8: "Falling quickly"
};

function getTemperatureColor(tempF) {
  if (!tempF || tempF === 'N/A' || typeof tempF !== 'string' || !tempF.includes('°F')) {
    console.warn(`Invalid temperature value for coloring: ${tempF}`);
    return 'var(--temp-color)';
  }
  const value = parseFloat(tempF.replace('°F', ''));
  if (isNaN(value)) {
    console.warn(`Failed to parse temperature: ${tempF}`);
    return 'var(--temp-color)';
  }
  const minTemp = 32, maxTemp = 100;
  const normalized = Math.min(Math.max((value - minTemp) / (maxTemp - minTemp), 0), 1);
  const r = Math.round(255 * normalized);
  const b = Math.round(255 * (1 - normalized));
  return `rgb(${r}, 0, ${b})`;
}

function formatPrecipitation(value) {
  if (!value || value === 'N/A' || isNaN(parseFloat(value))) return 'N/A';
  return `${parseFloat(value).toFixed(2)}in`;
}

function updateClock() {
  const now = luxon.DateTime.now().setZone(currentTimezone);
  elements.clock.textContent = now.toFormat('h:mm:ss a');
}

function convertToAmericanUnits(observations, variables) {
  const converted = {}, lastNonNullValues = {}, excludedVars = [
    'air_temp_high_6_hour_set_1', 'air_temp_low_6_hour_set_1',
    'air_temp_high_24_hour_set_1', 'air_temp_low_24_hour_set_1',
    'precip_accum_one_hour_set_1', 'precip_accum_three_hour_set_1',
    'precip_accum_six_hour_set_1', 'precip_accum_24_hour_set_1'
  ];
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

  function formatPressureTendency(value) {
    const code = Math.floor(value / 1000);
    const hPaChange = (value % 1000) / 10;
    const sign = code >= 0 && code <= 3 ? '+' : (code >= 5 && code <= 8 ? '-' : '');
    return `${pressureTendencyCodes[code] || 'Unknown'}: ${sign}${hPaChange.toFixed(1)} hPa`;
  }

  variables.forEach(v => {
    if (!observations[v] || !Array.isArray(observations[v]) || observations[v].length !== allTimestamps.length) {
      if (!excludedVars.includes(v)) {
        converted[v] = Array(allTimestamps.length).fill('');
        lastNonNullValues[v] = '';
      }
      return;
    }
    let lastNonNull = null;
    converted[v] = observations[v].map((value, i) => {
      if (value !== null && value !== '' && !isNaN(parseFloat(value))) {
        lastNonNull = parseFloat(value);
        if (unitMap.temperature.includes(v)) return `${(lastNonNull * 9/5 + 32).toFixed(1)}°F`;
        if (unitMap.wind.includes(v)) return `${(lastNonNull * 2.23694).toFixed(2)}mph`;
        if (v.includes('altimeter')) return `${(lastNonNull * 0.0002953).toFixed(2)}inHg`;
        if (unitMap.pressure.includes(v)) return `${(lastNonNull * 0.01).toFixed(2)}mbar`;
        if (unitMap.precip.includes(v)) return formatPrecipitation((lastNonNull * 0.03937));
        if (v.includes('visibility')) {
          const miles = lastNonNull;
          return miles >= 10 ? '10.0mi' : `${miles.toFixed(1)}mi`;
        }
        if (v.includes('ceiling')) return `${(lastNonNull * 3.28084).toFixed(0)}ft`;
        if (v.includes('pressure_tendency')) return formatPressureTendency(lastNonNull);
        if (unitMap.wind_direction.includes(v)) return `${lastNonNull}°`;
        if (unitMap.percentage.includes(v)) return `${lastNonNull.toFixed(2)}%`;
        return lastNonNull;
      } else if (unitMap.text.includes(v) && value) {
        lastNonNull = value;
        return value;
      }
      if (lastNonNull !== null && !isNaN(lastNonNull) && !excludedVars.includes(v)) {
        if (unitMap.temperature.includes(v)) return `${(lastNonNull * 9/5 + 32).toFixed(1)}°F`;
        if (unitMap.wind.includes(v)) return `${(lastNonNull * 2.23694).toFixed(2)}mph`;
        if (v.includes('altimeter')) return `${(lastNonNull * 0.0002953).toFixed(2)}inHg`;
        if (unitMap.pressure.includes(v)) return `${(lastNonNull * 0.01).toFixed(2)}mbar`;
        if (unitMap.precip.includes(v)) return formatPrecipitation((lastNonNull * 0.03937));
        if (v.includes('visibility')) {
          const miles = lastNonNull;
          return miles >= 10 ? '10.0mi' : `${miles.toFixed(1)}mi`;
        }
        if (v.includes('ceiling')) return `${(lastNonNull * 3.28084).toFixed(0)}ft`;
        if (v.includes('pressure_tendency')) return formatPressureTendency(lastNonNull);
        if (unitMap.wind_direction.includes(v)) return `${lastNonNull}°`;
        if (unitMap.percentage.includes(v)) return `${lastNonNull.toFixed(2)}%`;
        return lastNonNull;
      }
      return unitMap.text.includes(v) && value ? value : '';
    });
    lastNonNullValues[v] = lastNonNull !== null ? (
      unitMap.temperature.includes(v) ? `${(lastNonNull * 9/5 + 32).toFixed(1)}°F` :
      unitMap.wind.includes(v) ? `${(lastNonNull * 2.23694).toFixed(2)}mph` :
      v.includes('altimeter') ? `${(lastNonNull * 0.0002953).toFixed(2)}inHg` :
      unitMap.pressure.includes(v) ? `${(lastNonNull * 0.01).toFixed(2)}mbar` :
      unitMap.precip.includes(v) ? formatPrecipitation((lastNonNull * 0.03937)) :
      v.includes('visibility') ? (lastNonNull >= 10 ? '10.0mi' : `${lastNonNull.toFixed(1)}mi`) :
      v.includes('ceiling') ? `${(lastNonNull * 3.28084).toFixed(0)}ft` :
      v.includes('pressure_tendency') ? formatPressureTendency(lastNonNull) :
      unitMap.wind_direction.includes(v) ? `${lastNonNull}°` :
      unitMap.percentage.includes(v) ? `${lastNonNull.toFixed(2)}%` :
      unitMap.text.includes(v) ? lastNonNull : lastNonNull
    ) : (unitMap.text.includes(v) && observations[v][observations[v].length - 1] ? observations[v][observations[v].length - 1] : '');
  });
  return { converted, lastNonNullValues };
}

function updateSummaryTable(observations) {
  const excludedVars = [
    'air_temp_high_6_hour_set_1', 'air_temp_low_6_hour_set_1',
    'air_temp_high_24_hour_set_1', 'air_temp_low_24_hour_set_1',
    'precip_accum_one_hour_set_1', 'precip_accum_three_hour_set_1',
    'precip_accum_six_hour_set_1', 'precip_accum_24_hour_set_1'
  ];
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
    if (observations[v] && Array.isArray(observations[v])) {
      for (let i = observations[v].length - 1; i >= 0; i--) {
        const value = observations[v][i];
        if (value !== null && value !== '' && !isNaN(parseFloat(value))) {
          const parsedValue = parseFloat(value);
          lastValues[v] = v.includes('air_temp') ? `${(parsedValue * 9/5 + 32).toFixed(1)}°F` :
                          v.includes('precip_accum') ? formatPrecipitation(parsedValue * 0.03937) : `${parsedValue.toFixed(4)}`;
          break;
        }
      }
    }
  });
  $('#summary-table-body').html(excludedVars.map(v => {
    const label = labelMap[v] || v.replace('_set_1', '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    const cellClass = v.includes('air_temp') ? `font-bold temp-color` : v.includes('precip_accum') ? `font-bold precip-color` : '';
    const style = v.includes('air_temp') ? `style="color: ${getTemperatureColor(lastValues[v])}"` :
                  v.includes('precip_accum') ? `style="color: var(--precip-color)"` : '';
    return `<tr><td class="border border-gray-200 p-3">${label}</td><td class="${cellClass} border border-gray-200 p-3" ${style}>${lastValues[v]}</td></tr>`;
  }).join(''));
}

function displayStationData(station) {
  if (!station || !station.OBSERVATIONS || !station.OBSERVATIONS.date_time) {
    console.error('Invalid station data:', station);
    $('#data-table tbody').html('');
    $('#summary-table-body').html('');
    $('#data-view-title').text(`Station: ${currentStationId || 'Unknown'} | Last Updated: N/A`);
    return;
  }
  allObservations = station.OBSERVATIONS;
  allTimestamps = (allObservations.date_time || []).slice().reverse();
  if (!allTimestamps.length) {
    console.error('No timestamps in station data');
    $('#data-table tbody').html('');
    $('#summary-table-body').html('');
    $('#data-view-title').text(`Station: ${currentStationId || 'Unknown'} | Last Updated: N/A`);
    return;
  }
  const allVariables = Object.keys(allObservations).filter(key => key !== 'date_time');
  const excludePatterns = /cloud_layer|metar|pressure_change_code|dew_point_temperature_set_1(?!d)|air_temp_high_6_hour_set_1|air_temp_low_6_hour_set_1|air_temp_high_24_hour_set_1|air_temp_low_24_hour_set_1|precip_accum_one_hour_set_1|precip_accum_three_hour_set_1|precip_accum_six_hour_set_1|precip_accum_24_hour_set_1|sea_level_pressure_set_1$|sea_level_pressure_tendency$|weather_cond_code_set_1/;
  const variables = allVariables.filter(v => !excludePatterns.test(v));
  const sortedVariables = [
    'air_temp_set_1', 'relative_humidity_set_1', 'wind_speed_set_1', 'heat_index_set_1d', 'weather_summary_set_1d',
    'wind_cardinal_direction_set_1d', 'wind_gust_set_1', 'visibility_set_1', 'weather_condition_set_1d',
    'dew_point_temperature_set_1d', 'ceiling_set_1', 'pressure_set_1d', 'sea_level_pressure_set_1d',
    'altimeter_set_1', 'pressure_tendency_set_1', 'wet_bulb_temp_set_1d', 'wind_direction_set_1',
    'peak_wind_speed_set_1', 'peak_wind_direction_set_1'
  ].filter(v => variables.includes(v)).concat(
    variables.filter(v => ![
      'air_temp_set_1', 'relative_humidity_set_1', 'wind_speed_set_1', 'heat_index_set_1d', 'weather_summary_set_1d',
      'wind_cardinal_direction_set_1d', 'wind_gust_set_1', 'visibility_set_1', 'weather_condition_set_1d',
      'dew_point_temperature_set_1d', 'ceiling_set_1', 'pressure_set_1d', 'sea_level_pressure_set_1d',
      'altimeter_set_1', 'pressure_tendency_set_1', 'wet_bulb_temp_set_1d', 'wind_direction_set_1',
      'peak_wind_speed_set_1', 'peak_wind_direction_set_1'
    ].includes(v))
  );
  const filteredObservations = {};
  sortedVariables.forEach(v => {
    filteredObservations[v] = allObservations[v] && Array.isArray(allObservations[v]) && allObservations[v].length === allTimestamps.length
      ? allObservations[v].slice().reverse()
      : Array(allTimestamps.length).fill(null);
  });
  const { converted: convertedObservations, lastNonNullValues } = convertToAmericanUnits(filteredObservations, sortedVariables);
  $('#data-view-title').text(`Station: ${station.STID} | Last Updated: ${luxon.DateTime.now().setZone(currentTimezone).toFormat('MM/dd/yyyy HH:mm:ss')}`);
  const officialLabels = {
    'air_temp_set_1': 'Air Temperature: °F',
    'relative_humidity_set_1': 'Relative Humidity: %',
    'wind_speed_set_1': 'Wind Speed: mph',
    'heat_index_set_1d': 'Heat Index: °F',
    'weather_summary_set_1d': 'Weather Summary',
    'wind_cardinal_direction_set_1d': 'Wind Cardinal Direction',
    'wind_gust_set_1': 'Wind Gust: mph',
    'weather_condition_set_1d': 'Weather Condition',
    'dew_point_temperature_set_1d': 'Dew Point Temperature: °F',
    'visibility_set_1': 'Visibility: miles',
    'ceiling_set_1': 'Ceiling Height: ft',
    'pressure_set_1d': 'Station Pressure: mbar',
    'sea_level_pressure_set_1d': 'Sea Level Pressure: mbar',
    'altimeter_set_1': 'Altimeter Setting: inHg',
    'pressure_tendency_set_1': 'Pressure Tendency',
    'wet_bulb_temp_set_1d': 'Wet Bulb Temperature: °F',
    'wind_direction_set_1': 'Wind Direction: °',
    'peak_wind_speed_set_1': 'Peak Wind Speed: mph',
    'peak_wind_direction_set_1': 'Peak Wind Direction: °'
  };
  $('#data-table thead tr').html([
    `<th class="border border-gray-200 p-3 bg-gray-800 text-white sticky top-0 z-[110] min-w-[110px]">Date and Time</th>`,
    ...sortedVariables.map(v => {
      const label = officialLabels[v] || v.replace('_set_1', '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
      return `<th class="border border-gray-200 p-3 bg-gray-800 text-white sticky top-0 z-[100]">${label}</th>`;
    })
  ].join(''));
  $('#data-table tbody').html(allTimestamps.slice(0, 72).map((time, index) => {
    const parsedTime = luxon.DateTime.fromISO(time, { zone: currentTimezone }).isValid ?
      luxon.DateTime.fromISO(time, { zone: currentTimezone }).toFormat('MM/dd/yyyy h:mm a') : '';
    return `<tr><td class="border border-gray-200 p-3 sticky left-0 z-[90] min-w-[110px] bg-[var(--card-bg)]">${parsedTime}</td>${sortedVariables.map(v => {
      const value = convertedObservations[v][index] || '';
      return `<td class="border border-gray-200 p-3">${value}</td>`;
    }).join('')}</tr>`;
  }).join(''));
  updateSummaryTable(allObservations);
  const tableContainer = document.getElementById('data-table-container');
  tableContainer.style.opacity = '0';
  tableContainer.style.display = 'none';
  setTimeout(() => {
    tableContainer.style.display = 'block';
    tableContainer.offsetHeight;
    tableContainer.style.opacity = '1';
  }, 10);
}

async function fetchStationData(stationId, startDate, endDate) {
  if (!stationId) {
    console.error('No station ID provided');
    $('#data-table tbody').html('');
    $('#summary-table-body').html('');
    $('#data-view-title').text(`Station: Unknown | Last Updated: N/A`);
    return false;
  }
  const formatDate = date => luxon.DateTime.fromJSDate(date).toUTC().toFormat('yyyyMMddHHmm');
  const startFormatted = formatDate(startDate), endFormatted = formatDate(endDate);
  const url = `${SYNOPTIC_API_BASE_URL}stations/timeseries?stid=${stationId}&start=${startFormatted}&end=${endFormatted}&token=${SYNOPTIC_API_TOKEN}&obtimezone=local`;
  console.log(`Fetching Synoptic data for station ${stationId}: ${url}`);
  try {
    const response = await new Promise((resolve, reject) => {
      $.ajax({
        url: url,
        method: 'GET',
        success: (data, status, xhr) => resolve({ data, status, xhr }),
        error: (xhr, status, error) => reject(new Error(`AJAX error: ${status}, ${error}`))
      });
    });
    const data = response.data;
    console.log('Synoptic API response:', data);
    if (!data.STATION || !data.STATION[0] || !data.STATION[0].OBSERVATIONS || !data.STATION[0].OBSERVATIONS.date_time) {
      console.error('Invalid Synoptic data structure:', data);
      $('#data-table tbody').html('');
      $('#summary-table-body').html('');
      $('#data-view-title').text(`Station: ${stationId} | Last Updated: N/A`);
      return false;
    }
    currentStationId = data.STATION[0].STID;
    allObservations = data.STATION[0].OBSERVATIONS;
    allTimestamps = (allObservations.date_time || []).slice().reverse();
    displayStationData(data.STATION[0]);
    return true;
  } catch (error) {
    console.error(`Synoptic API error: ${error.message}`);
    $('#data-table tbody').html('');
    $('#summary-table-body').html('');
    $('#data-view-title').text(`Station: ${stationId} | Last Updated: N/A`);
    elements.locationError.textContent = error.message.includes('429') ? 'Error: Synoptic API rate limit exceeded. Please try again later.' : `Error: Failed to fetch Synoptic data: ${error.message}`;
    elements.locationError.classList.remove('hidden');
    return false;
  }
}

$(document).ready(() => {
  const API_KEY = '86f857c7c80b4ba3bfe3afdb9fefb393';
  const GEOCODING_API = 'https://api.opencagedata.com/geocode/v1/json';
  const NWS_API = 'https://api.weather.gov';
  let selectedLocation = null, currentLocation = null;
  let activeAlerts = [];

  const TOP_CITIES = [
    { name: 'New York, NY, U.S.', lat: 40.7128, lng: -74.0060 },
    { name: 'Los Angeles, CA, U.S.', lat: 34.0522, lng: -118.2437 },
    { name: 'Chicago, IL, U.S.', lat: 41.8781, lng: -87.6298 },
    { name: 'Houston, TX, U.S.', lat: 29.7604, lng: -95.3698 },
    { name: 'Phoenix, AZ, U.S.', lat: 33.4484, lng: -112.0740 }
  ];

  const savedTheme = localStorage.getItem('theme') || 'light';
  document.documentElement.setAttribute('data-theme', savedTheme);
  elements.themeToggle = document.getElementById('theme-toggle');
  elements.themeToggle.checked = savedTheme === 'dark';

  const getCachedData = (key, ttl = 60 * 60 * 1000) => {
    const cached = JSON.parse(localStorage.getItem(key));
    if (cached && Date.now() - cached.timestamp < ttl) {
      console.log(`Using cached data for ${key}`);
      return cached.data;
    }
    return null;
  };

  const setCachedData = (key, data) => {
    console.log(`Caching data for ${key}`);
    localStorage.setItem(key, JSON.stringify({ data, timestamp: Date.now() }));
  };

  const preloadTopCities = () => {
    TOP_CITIES.forEach(city => {
      const cacheKey = `geo_${city.name.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '')}`;
      if (!getCachedData(cacheKey)) {
        setCachedData(cacheKey, { name: city.name, lat: city.lat, lng: city.lng });
      }
    });
  };

  preloadTopCities();

  setInterval(updateClock, 1000);
  updateClock();

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

  const fetchGeocoding = async (query) => {
    const cacheKey = `geo_${query.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '')}`;
    const cached = getCachedData(cacheKey);
    if (cached) return cached;
    const response = await fetchWithRetry(`${GEOCODING_API}?q=${encodeURIComponent(query)}&key=${API_KEY}&countrycode=US&limit=5`);
    const data = await response.json();
    if (!data.results.length) throw new Error('No geocoding results');
    const result = {
      name: data.results[0].formatted.replace(/United States of America/, 'U.S.'),
      lat: data.results[0].geometry.lat,
      lng: data.results[0].geometry.lng
    };
    setCachedData(cacheKey, result);
    return result;
  };

  const fetchHourlyForecast = async (wfo, gridX, gridY) => {
    const cacheKey = `hourly_${wfo}_${gridX}_${gridY}`;
    let hourlyData = getCachedData(cacheKey);
    if (!hourlyData) {
      const response = await fetchWithRetry(`${NWS_API}/gridpoints/${wfo}/${gridX},${gridY}/forecast/hourly`);
      hourlyData = await response.json();
      if (!hourlyData.properties?.periods) throw new Error('No hourly forecast data');
      setCachedData(cacheKey, hourlyData);
    }
    return hourlyData;
  };

  const fetchSevenDayForecast = async (wfo, gridX, gridY) => {
    const cacheKey = `7day_${wfo}_${gridX}_${gridY}`;
    let forecastData = getCachedData(cacheKey);
    if (!forecastData) {
      const response = await fetchWithRetry(`${NWS_API}/gridpoints/${wfo}/${gridX},${gridY}/forecast`);
      forecastData = await response.json();
      if (!forecastData.properties?.periods) throw new Error('No 7-day forecast data');
      setCachedData(cacheKey, forecastData);
    }
    return forecastData;
  };

  const fetchAlerts = async (lat, lng) => {
    const response = await fetchWithRetry(`${NWS_API}/alerts/active?point=${lat},${lng}`);
    const data = await response.json();
    return data.features || [];
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
      console.error(`Error fetching current conditions: ${error.message}`);
      return {
        stationId: null,
        currentConditions: 'N/A',
        icon: `${NWS_API}/icons/land/day/skc?size=medium`,
        nwsData: {
          temperature: 'N/A',
          humidity: 'N/A',
          dewPoint: 'N/A',
          visibility: 'N/A',
          windSpeed: 'N/A',
          windDirection: 'N/A',
          windGust: 'N/A',
          pressure: 'N/A',
          lastUpdated: 'N/A'
        }
      };
    }
  };

  const fetchWithRetry = async (url, retries = 3, delay = 2000) => {
    for (let i = 0; i < retries; i++) {
      try {
        console.log(`Fetching: ${url}`);
        const response = await fetch(url, { headers: { 'User-Agent': 'NWS Weather App', 'accept': 'application/geo+json' } });
        if (response.status === 429) {
          console.log(`Rate limit exceeded for ${url}. Retrying after ${delay}ms...`);
          elements.locationError.textContent = `Error: Rate limit exceeded for ${new URL(url).hostname}. Retrying...`;
          elements.locationError.classList.remove('hidden');
          await new Promise(resolve => setTimeout(resolve, delay * (i + 1)));
          continue;
        }
        if (!response.ok) throw new Error(`HTTP error: ${response.status}`);
        console.log(`Successful response from ${url}: ${response.status}`);
        return response;
      } catch (error) {
        console.error(`Fetch error for ${url}: ${error.message}`);
        if (i === retries - 1) throw new Error(`Max retries reached: ${error.message}`);
      }
    }
  };

  async function fetchWeather(location, lat, lng, isGeolocation = false) {
    console.log(`Starting fetchWeather for location: ${location}, lat: ${lat}, lng: ${lng}, isGeolocation: ${isGeolocation}`);
    if (!isGeolocation && !location) {
      console.error('No location provided');
      elements.locationError.textContent = 'Error: Please enter a valid location.';
      elements.locationError.classList.remove('hidden');
      elements.loading.classList.add('hidden');
      elements.starter.classList.remove('hidden');
      return;
    }
    elements.locationError.classList.add('hidden');
    elements.loading.classList.remove('hidden');
    elements.starter.classList.add('hidden');
    elements.result.classList.add('hidden');
    elements.tabs.classList.add('hidden');
    try {
      let locationName;
      if (isGeolocation) {
        locationName = location;
      } else if (selectedLocation && selectedLocation.formatted?.replace(/United States of America/, 'U.S.') === location) {
        lat = selectedLocation.geometry.lat;
        lng = selectedLocation.geometry.lng;
        locationName = selectedLocation.formatted.replace(/United States of America/, 'U.S.');
      } else {
        const geoData = await fetchGeocoding(location);
        lat = geoData.lat;
        lng = geoData.lng;
        locationName = geoData.name;
      }
      lat = Number(lat.toFixed(4));
      lng = Number(lng.toFixed(4));
      if (isNaN(lat) || isNaN(lng)) throw new Error('Invalid coordinates');
      console.log(`Resolved coordinates: ${lat}, ${lng}`);

      const pointsResponse = await fetchWithRetry(`${NWS_API}/points/${lat},${lng}`);
      const pointsData = await pointsResponse.json();
      if (!pointsData.properties) throw new Error('No points data');
      const stationsUrl = pointsData.properties.observationStations;
      const wfo = pointsData.properties.gridId;
      const gridX = pointsData.properties.gridX;
      const gridY = pointsData.properties.gridY;
      currentTimezone = pointsData.properties.timeZone || 'America/Chicago';
      console.log(`WFO: ${wfo}, Grid: ${gridX},${gridY}, Timezone: ${currentTimezone}`);
      updateClock();

      const { stationId, currentConditions, icon, nwsData } = await fetchCurrentConditions(stationsUrl);
      currentStationId = stationId;

      const endDate = new Date();
      const startDate = new Date(endDate.getTime() - 3 * 24 * 60 * 60 * 1000);
      const synopticSuccess = await fetchStationData(stationId, startDate, endDate);
      let displayData = nwsData;
      let lastUpdated = nwsData.lastUpdated;
      if (synopticSuccess && allObservations && allTimestamps.length) {
        const observations = allObservations;
        const timestamps = allTimestamps;
        const variables = [
          'air_temp_set_1', 'relative_humidity_set_1', 'heat_index_set_1d', 'dew_point_temperature_set_1d',
          'visibility_set_1', 'wind_speed_set_1', 'wind_gust_set_1', 'wind_cardinal_direction_set_1d',
          'pressure_set_1d', 'precip_accum_24_hour_set_1', 'air_temp_high_24_hour_set_1', 'air_temp_low_24_hour_set_1'
        ];
        const { lastNonNullValues } = convertToAmericanUnits(observations, variables);
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
          lastUpdated: timestamps[0] ? luxon.DateTime.fromISO(timestamps[0], { zone: currentTimezone }).toFormat('MM/dd/yyyy h:mm a') : nwsData.lastUpdated
        };
        lastUpdated = displayData.lastUpdated;
      } else {
        console.warn('Using NWS data as fallback for "Now" section due to Synoptic data failure');
        displayData = {
          ...nwsData,
          feelsLike: 'N/A',
          precip24Hour: 'N/A',
          tempHigh24Hour: 'N/A',
          tempLow24Hour: 'N/A'
        };
      }

      const hourlyData = await fetchHourlyForecast(wfo, gridX, gridY);
      activeAlerts = await fetchAlerts(lat, lng);
      const forecastData = await fetchSevenDayForecast(wfo, gridX, gridY);
      const periods = forecastData.properties.periods;
      elements.header.textContent = locationName;
      currentLocation = locationName;
      elements.now.innerHTML = `
        <div class="weather-card">
          <div class="grid grid-cols-1 gap-6 text-center">
            <p class="text-6xl font-extrabold temp-color" style="color: ${getTemperatureColor(displayData.temperature)}">${displayData.temperature}</p>
            <img src="${icon}" alt="${currentConditions}" class="mx-auto w-24 h-24">
            <p class="text-xl font-semibold">${currentConditions}</p>
          </div>
          <div class="grid grid-cols-2 gap-6 mt-6">
            <div class="bg-card p-4 rounded-lg shadow">
              <p class="text-base mb-2">Feels Like: <span style="color: ${getTemperatureColor(displayData.feelsLike)}">${displayData.feelsLike}</span></p>
              <p class="text-base mb-2">Humidity: <span style="color: var(--humidity-color)">${displayData.humidity}</span></p>
              <p class="text-base mb-2">Dew Point: <span style="color: var(--dewpoint-color)">${displayData.dewPoint}</span></p>
              <p class="text-base mb-2">Wind: <span style="color: var(--wind-color)">${displayData.windSpeed}</span> <span style="color: var(--wind-direction-color)">${displayData.windDirection}</span></p>
              <p class="text-base">Wind Gust: <span style="color: var(--wind-color)">${displayData.windGust}</span></p>
            </div>
            <div class="bg-card p-4 rounded-lg shadow">
              <p class="text-base mb-2">Pressure: <span style="color: var(--pressure-color)">${displayData.pressure}</span></p>
              <p class="text-base mb-2">24hr Precip: <span style="color: var(--precip-color)">${displayData.precip24Hour}</span></p>
              <p class="text-base mb-2">24hr High: <span style="color: ${getTemperatureColor(displayData.tempHigh24Hour)}">${displayData.tempHigh24Hour}</span></p>
              <p class="text-base">24hr Low: <span style="color: ${getTemperatureColor(displayData.tempLow24Hour)}">${displayData.tempLow24Hour}</span></p>
            </div>
          </div>
          <div class="bg-card p-4 rounded-lg shadow mt-6">
            <p class="text-base">Last Updated: <span>${lastUpdated}</span></p>
            <p class="text-sm text-gray-500" style="color: var(--text-color)">Coordinates: ${lat.toFixed(4)}, ${lng.toFixed(4)}</p>
          </div>
        </div>
      `;
      elements.hourly.innerHTML = '';
      const now = new Date(), twentyFourHoursLater = new Date(now.getTime() + 24 * 60 * 60 * 1000);
      const hourlyPeriods = hourlyData.properties.periods.filter(period => {
        const periodTime = new Date(period.startTime);
        return periodTime >= now && periodTime <= twentyFourHoursLater;
      }).slice(0, 24);
      for (const period of hourlyPeriods) {
        const timeStr = new Date(period.startTime).toLocaleTimeString([], { hour: 'numeric', hour12: true });
        const chanceOfRain = period.probabilityOfPrecipitation?.value != null ? `${period.probabilityOfPrecipitation.value}%` : 'N/A';
        const tempF = period.temperatureUnit === 'F' ? `${period.temperature}°F` : `${Math.round((period.temperature * 9/5) + 32)}°F`;
        const dewPoint = period.dewpoint?.value != null ? `${Math.round((period.dewpoint.value * 9/5) + 32)}°F` : 'N/A';
        const humidity = period.relativeHumidity?.value != null ? `${period.relativeHumidity.value}%` : 'N/A';
        const wind = period.windSpeed && period.windDirection ? `${period.windSpeed} ${period.windDirection}` : 'N/A';
        const row = document.createElement('div');
        row.className = 'hour-row';
        row.innerHTML = `
          <div class="main-row">
            <div class="hour-cell font-medium">${timeStr}</div>
            <div class="hour-cell temp-color" style="color: ${getTemperatureColor(tempF)}">${tempF}</div>
            <div class="hour-cell"><img src="${period.icon || `${NWS_API}/icons/land/day/skc?size=medium`}" alt="${period.shortForecast || 'Clear'}" class="mx-auto"></div>
            <div class="hour-cell">${period.shortForecast || 'N/A'}</div>
          </div>
          <div class="additional-row">
            <div class="hour-cell additional" style="color: var(--precip-color)">Rain: ${chanceOfRain}</div>
            <div class="hour-cell additional" style="color: var(--dewpoint-color)">Dew Pt: ${dewPoint}</div>
            <div class="hour-cell additional" style="color: var(--humidity-color)">Hum: ${humidity}</div>
            <div class="hour-cell additional" style="color: var(--wind-color)">Wind: ${wind}</div>
          </div>
        `;
        elements.hourly.appendChild(row);
      }
      elements.sevenDay.innerHTML = '<div class="seven-day-grid"></div>';
      const sevenDayGrid = elements.sevenDay.querySelector('.seven-day-grid');
      let dayCount = 0, i = 0;
      while (i < periods.length && dayCount < 7) {
        const period = periods[i];
        const forecastText = period.shortForecast || 'N/A';
        const tempF = period.temperatureUnit === 'F' ? `${period.temperature}°F` : `${Math.round((period.temperature * 9/5) + 32)}°F`;
        const precipChance = period.probabilityOfPrecipitation?.value != null ? `${period.probabilityOfPrecipitation.value}%` : 'N/A';
        const wind = period.windSpeed && period.windDirection ? `${period.windSpeed} ${period.windDirection}` : 'N/A';
        const detailedForecast = period.detailedForecast ? period.detailedForecast.substring(0, 100) + (period.detailedForecast.length > 100 ? '...' : '') : 'N/A';
        const dayElement = document.createElement('div');
        dayElement.className = 'day-item';
        dayElement.innerHTML = `
          <p class="font-medium">${period.name}</p>
          <p>${period.isDaytime ? 'High' : 'Low'}: <span class="temp-color" style="color: ${getTemperatureColor(tempF)}">${tempF}</span></p>
          <p>Precip: <span style="color: var(--precip-color)">${precipChance}</span></p>
          <p>Wind: <span style="color: var(--wind-color)">${wind}</span></p>
          <img src="${period.icon || `${NWS_API}/icons/land/day/skc?size=medium`}" alt="${forecastText}" class="mt-1">
          <p>${forecastText}</p>
          <p class="detailed-forecast">${detailedForecast}</p>
        `;
        sevenDayGrid.appendChild(dayElement);
        i++;
        if (i >= periods.length || (i % 2 === 0 && periods[i-1].isDaytime !== periods[i-2].isDaytime)) {
          dayCount++;
        }
      }
      elements.alertsCount.textContent = activeAlerts.length;
      elements.alertsCount.classList.toggle('hidden', activeAlerts.length === 0);
      elements.alertsButton.classList.remove('hidden');
      elements.alertsList.innerHTML = activeAlerts.length ? activeAlerts.map((alert, index) => {
        const severity = alert.properties.severity?.toLowerCase() || 'low';
        return `
          <div class="alert-item ${severity}" data-alert-index="${index}">
            <p class="alert-title" data-alert-index="${index}">
              <span>${alert.properties.headline || alert.properties.event || 'Alert'}</span>
              <span class="severity ${severity}">${alert.properties.severity || 'Unknown'}</span>
            </p>
            <p class="alert-description" id="alert-description-${index}">${alert.properties.description || 'No description available.'}</p>
          </div>
        `;
      }).join('') : '<p class="p-2 text-gray-600">No active alerts.</p>';
      console.log('Weather data fetched successfully, displaying UI');
      elements.loading.classList.add('hidden');
      elements.result.classList.remove('hidden');
      elements.tabs.classList.remove('hidden');
      elements.starter.classList.add('hidden');
      selectedLocation = null;
    } catch (e) {
      console.error(`Weather fetch error: ${e.message}`);
      elements.loading.classList.add('hidden');
      elements.locationError.textContent = e.message.includes('rate limit') ? `Error: API rate limit exceeded. Please try again later.` : `Error: ${e.message}`;
      elements.locationError.classList.remove('hidden');
      elements.starter.classList.remove('hidden');
      elements.result.classList.add('hidden');
      elements.tabs.classList.add('hidden');
    }
  }

  let lastQuery = '';
  const debounce = (func, wait) => {
    let timeout;
    return (...args) => {
      clearTimeout(timeout);
      timeout = setTimeout(() => func(...args), wait);
    };
  };

  const updateAutocomplete = debounce(async (query) => {
    if (!query || query.length < 3 || query === lastQuery) {
      elements.autocomplete.classList.add('hidden');
      return;
    }
    lastQuery = query;
    elements.autocomplete.classList.remove('hidden');
    elements.autocomplete.innerHTML = '<div class="autocomplete-item">Searching...</div>';
    try {
      const cacheKey = `geo_${query.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '')}`;
      let data;
      const cached = getCachedData(cacheKey);
      if (cached) {
        data = { results: [{ formatted: cached.name, geometry: { lat: cached.lat, lng: cached.lng } }] };
      } else {
        const response = await fetchWithRetry(`${GEOCODING_API}?q=${encodeURIComponent(query)}&key=${API_KEY}&countrycode=US&limit=5`);
        data = await response.json();
      }
      if (data.results.length) {
        elements.autocomplete.innerHTML = data.results.map(result => `
          <div class="autocomplete-item" data-lat="${result.geometry.lat}" data-lng="${result.geometry.lng}" data-name="${result.formatted.replace(/United States of America/, 'U.S.')}">
            ${result.formatted.replace(/United States of America/, 'U.S.')}
          </div>
        `).join('');
      } else {
        elements.autocomplete.innerHTML = '<div class="autocomplete-item">No results found</div>';
      }
    } catch (error) {
      console.error(`Autocomplete error: ${error.message}`);
      elements.autocomplete.innerHTML = '<div class="autocomplete-item">Error fetching suggestions</div>';
    }
  }, 300);

  elements.locationInput.addEventListener('input', (e) => {
    const query = e.target.value.trim();
    updateAutocomplete(query);
  });

  elements.locationInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      const query = elements.locationInput.value.trim();
      if (query) {
        elements.autocomplete.classList.add('hidden');
        fetchWeather(query);
      }
    }
  });

  $(document).on('click', '.autocomplete-item', function() {
    const lat = $(this).data('lat');
    const lng = $(this).data('lng');
    const name = $(this).data('name');
    selectedLocation = { geometry: { lat, lng }, formatted: name };
    elements.locationInput.value = name;
    elements.autocomplete.classList.add('hidden');
    fetchWeather(name, lat, lng);
  });

  elements.header.addEventListener('click', () => {
    elements.starter.classList.remove('hidden');
    elements.result.classList.add('hidden');
    elements.tabs.classList.add('hidden');
    elements.alerts.classList.remove('active');
    elements.settings.classList.remove('active');
    elements.locationInput.focus();
  });

  $(elements.tabs).on('click', '.tab-button', function() {
    const tab = $(this).data('tab');
    $('.tab-button').removeClass('active');
    $(this).addClass('active');
    $('.tab-content').removeClass('active');
    $(`#${tab}-section`).addClass('active');
  });

  $(elements.alertsList).on('click', '.alert-title', function() {
    const index = $(this).data('alert-index');
    $(`#alert-description-${index}`).toggleClass('active');
  });

  $(elements.alertsButton).on('click', () => {
    elements.alerts.classList.add('active');
    elements.result.classList.add('hidden');
    elements.tabs.classList.add('hidden');
    elements.starter.classList.add('hidden');
  });

  $(elements.settingsButton).on('click', () => {
    elements.settings.classList.add('active');
    elements.result.classList.add('hidden');
    elements.tabs.classList.add('hidden');
    elements.starter.classList.add('hidden');
  });

  $('.back-button').on('click', () => {
    elements.alerts.classList.remove('active');
    elements.settings.classList.remove('active');
    elements.result.classList.remove('hidden');
    elements.tabs.classList.remove('hidden');
    elements.starter.classList.add('hidden');
  });

  elements.themeToggle.addEventListener('change', (e) => {
    const theme = e.target.checked ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  });

  elements.autoLocate.addEventListener('click', () => {
    if (!navigator.geolocation) {
      elements.locationError.textContent = 'Error: Geolocation is not supported by your browser.';
      elements.locationError.classList.remove('hidden');
      return;
    }
    elements.geolocationMessage.classList.remove('hidden');
    elements.locationError.classList.add('hidden');
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;
        try {
          const locationName = await reverseGeocode(latitude, longitude);
          elements.locationInput.value = locationName;
          elements.geolocationMessage.classList.add('hidden');
          fetchWeather(locationName, latitude, longitude, true);
        } catch (error) {
          console.error(`Geolocation error: ${error.message}`);
          elements.geolocationMessage.classList.add('hidden');
          elements.locationError.textContent = `Error: ${error.message}`;
          elements.locationError.classList.remove('hidden');
        }
      },
      (error) => {
        console.error(`Geolocation error: ${error.message}`);
        elements.geolocationMessage.classList.add('hidden');
        elements.locationError.textContent = `Error: ${error.message}`;
        elements.locationError.classList.remove('hidden');
      }
    );
  });
});
