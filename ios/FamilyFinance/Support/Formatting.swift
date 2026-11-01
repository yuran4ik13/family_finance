import Foundation

// =========================
// SMALL HELPERS used all over the app
// =========================

extension Date {
    /// "2026-10-29" in the user's time zone. The backend uses this format
    /// for analytics periods.
    var dayKey: String {
        let parts = Calendar.current.dateComponents([.year, .month, .day], from: self)
        return String(
            format: "%04d-%02d-%02d",
            parts.year ?? 0,
            parts.month ?? 0,
            parts.day ?? 0
        )
    }

    /// "2026-10-29" -> Date (midnight in the user's time zone)
    static func fromDayKey(_ key: String) -> Date? {
        let parts = key.split(separator: "-").compactMap { Int($0) }

        guard parts.count == 3 else {
            return nil
        }

        return Calendar.current.date(
            from: DateComponents(year: parts[0], month: parts[1], day: parts[2])
        )
    }

    /// A date N days ago at the given time. Used for demo data.
    static func daysAgo(_ days: Int, hour: Int = 12, minute: Int = 0) -> Date {
        let calendar = Calendar.current
        let day = calendar.date(byAdding: .day, value: -days, to: .now) ?? .now

        return calendar.date(bySettingHour: hour, minute: minute, second: 0, of: day) ?? day
    }

    var startOfDay: Date {
        Calendar.current.startOfDay(for: self)
    }
}

extension String {
    /// nil for "" or "   ", otherwise the trimmed text
    var nilIfBlank: String? {
        let trimmed = trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? nil : trimmed
    }
}

extension KeyedDecodingContainer {
    /// The backend sends money either as a number (42000) or as a string
    /// ("-351.34", that's how the database Decimal type is sent).
    /// This accepts both.
    func decodeNumber(forKey key: Key) throws -> Double {
        if let number = try? decode(Double.self, forKey: key) {
            return number
        }

        let text = try decode(String.self, forKey: key)

        guard let number = Double(text) else {
            throw DecodingError.dataCorruptedError(
                forKey: key,
                in: self,
                debugDescription: "Not a number: \(text)"
            )
        }

        return number
    }
}

enum JSON {
    /// Turns JSON from the backend into Swift structs.
    /// Dates come as "2026-10-29T13:13:00.000Z" (with milliseconds),
    /// which the default decoder doesn't understand, so we parse them ourselves.
    static let decoder: JSONDecoder = {
        let decoder = JSONDecoder()

        decoder.dateDecodingStrategy = .custom { decoder in
            let text = try decoder.singleValueContainer().decode(String.self)

            if let date = try? Date.ISO8601FormatStyle(includingFractionalSeconds: true).parse(text) {
                return date
            }

            if let date = try? Date.ISO8601FormatStyle().parse(text) {
                return date
            }

            if let date = Date.fromDayKey(text) {
                return date
            }

            throw DecodingError.dataCorrupted(
                DecodingError.Context(
                    codingPath: decoder.codingPath,
                    debugDescription: "Unknown date format: \(text)"
                )
            )
        }

        return decoder
    }()
}
