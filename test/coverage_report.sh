#!/usr/bin/env bash

function fraction() {
  local file="${1}"
  local field="${2}"

  grep "${field}</span>" "${file}" -A 1 | grep -oE '[0-9]+/[0-9]+'
}

function calc_percentage() {
  local fraction="${1}"
  if [[ "${fraction}" =~ ([0-9]+)/([0-9]+) ]]; then
    local hit="${BASH_REMATCH[1]}"
    local total="${BASH_REMATCH[2]}"
    if (( total > 0 )); then
      awk -v h="$hit" -v t="$total" 'BEGIN { printf "%.2f", (h/t)*100 }'
    else
      echo "nan"
    fi
  else
    echo "error"
  fi
}

function create_time() {
  local file="${1}"
  grep -oE 'at [0-9]{4}-[0-9]{2}-[0-9]{2}T.+' "${file}" | sed 's/^at //'
}

function badge_color() {
  local percentage="${1}"
  if awk "BEGIN {exit !(${percentage} >= 80)}"; then
    echo "brightgreen"
  elif awk "BEGIN {exit !(${percentage} >= 60)}"; then
    echo "yellow"
  elif awk "BEGIN {exit !(${percentage} >= 40)}"; then
    echo "orange"
  else
    echo "red"
  fi
}

function badge_url() {
  local metric="${1}"
  local percentage="${2}"
  echo "https://img.shields.io/badge/${metric}-${percentage}%25-$(badge_color "${percentage}")"
}

function main() {
  COVERAGE_HTML="${1}"
  MARKDOWN_REPORT_PATH="${2}"

  if [ -z "${COVERAGE_HTML}" ]; then
    echo "Usage: $0 <coverage_html_file> [markdown_report_path]"
    exit 1
  fi

  if [ -f "${COVERAGE_HTML}" ]; then
    STATEMENTS_FRACTION=$(fraction "${COVERAGE_HTML}" "Statements")
    BRANCHES_FRACTION=$(fraction "${COVERAGE_HTML}" "Branches")
    FUNCTIONS_FRACTION=$(fraction "${COVERAGE_HTML}" "Functions")
    LINES_FRACTION=$(fraction "${COVERAGE_HTML}" "Lines")

    STATEMENTS_PCT=$(calc_percentage "${STATEMENTS_FRACTION}")
    BRANCHES_PCT=$(calc_percentage "${BRANCHES_FRACTION}")
    FUNCTIONS_PCT=$(calc_percentage "${FUNCTIONS_FRACTION}")
    LINES_PCT=$(calc_percentage "${LINES_FRACTION}")

    GENERATE_TIME=$(create_time "${COVERAGE_HTML}")

    echo "Statements   : ${STATEMENTS_PCT}% (${STATEMENTS_FRACTION})"
    echo "Branches     : ${BRANCHES_PCT}% (${BRANCHES_FRACTION})"
    echo "Functions    : ${FUNCTIONS_PCT}% (${FUNCTIONS_FRACTION})"
    echo "Lines        : ${LINES_PCT}% (${LINES_FRACTION})"
    echo "Generated on : ${GENERATE_TIME}"
  else
    echo "Coverage HTML report not found: ${COVERAGE_HTML}"
    exit 1
  fi

  if [ -n "${MARKDOWN_REPORT_PATH}" ]; then
    {
      echo "## Test Coverage"
      echo ""
      echo "### Coverage Report"
      echo ""
      echo "| Metric | Coverage | Hit/Total |"
      echo "|--------|----------|-----------|"
      echo "| Statements | ![Statements]($(badge_url "statements" "${STATEMENTS_PCT}")) | ${STATEMENTS_FRACTION} |"
      echo "| Branches | ![Branches]($(badge_url "branches" "${BRANCHES_PCT}")) | ${BRANCHES_FRACTION} |"
      echo "| Functions | ![Functions]($(badge_url "functions" "${FUNCTIONS_PCT}")) | ${FUNCTIONS_FRACTION} |"
      echo "| Lines | ![Lines]($(badge_url "lines" "${LINES_PCT}")) | ${LINES_FRACTION} |"
      echo ""
      echo "**Generated at:** ${GENERATE_TIME}"
    } >> "${MARKDOWN_REPORT_PATH}"
  fi
}

main "${@}"
