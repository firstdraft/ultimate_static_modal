# frozen_string_literal: true

require "rails/generators"

module UltimateStaticModal
  module Generators
    class InstallGenerator < Rails::Generators::Base
      source_root File.expand_path("templates", __dir__)

      desc "Installs UltimateStaticModal: copies the template controller and UTMR adapter, then wires them into Stimulus."

      def copy_static_modal_controller
        copy_file "static_modal_controller.js",
          "app/javascript/controllers/static_modal_controller.js"
      end

      def copy_modal_controller_adapter
        copy_file "modal_controller.js",
          "app/javascript/controllers/modal_controller.js"
      end

      def update_stimulus_controllers
        target_path = stimulus_target_path

        unless target_path
          say_manual_snippet
          return
        end

        register_static_modal_controller(target_path)
        register_modal_adapter(target_path)
      end

      def show_readme
        say "\nUltimateStaticModal installation complete!", :magenta
        say "Rebuild your JS bundle and restart Rails.", :yellow
      end

      private

      def stimulus_target_path
        candidates = %w[index.js application.js].filter_map do |filename|
          path = File.join(destination_root, "app", "javascript", "controllers", filename)
          [path, File.read(path)] if File.exist?(path)
        end

        match = candidates.find { |_, content| content.match?(upstream_register_pattern) }
        match ||= candidates.find { |_, content| content.match?(/Application\.start\(\)/) }
        match ||= candidates.first
        match&.first
      end

      def register_static_modal_controller(target_path)
        import_line = "import StaticModalController from \"./static_modal_controller\"\n"
        register_line = "application.register(\"static-modal\", StaticModalController)\n"
        content = File.read(target_path)

        insert_import(target_path, import_line, content) unless content.include?(import_line.strip)

        content = File.read(target_path)
        insert_registration(target_path, register_line, content) unless content.include?(register_line.strip)

        say "✅ Registered `static-modal` Stimulus controller.", :green
      end

      def register_modal_adapter(target_path)
        import_line = "import ModalController from \"./modal_controller\"\n"
        register_line = "application.register(\"modal\", ModalController)\n"
        content = File.read(target_path)

        if content.include?(import_line.strip)
          say "⏩ Frameless modal controller adapter already imported.", :blue
        elsif content.match?(upstream_import_pattern)
          gsub_file target_path, upstream_import_pattern, import_line
        else
          insert_import(target_path, import_line, content)
        end

        content = File.read(target_path)
        if content.include?(register_line.strip)
          say "⏩ Frameless modal controller adapter already registered.", :blue
        elsif content.match?(upstream_register_pattern)
          gsub_file target_path, upstream_register_pattern, register_line
          say "✅ Swapped UTMR modal registration for the frameless controller adapter.", :green
        else
          insert_registration(target_path, register_line, content)
          say "✅ Registered the frameless modal controller adapter.", :green
        end
      end

      def insert_import(target_path, import_line, content)
        import_anchor = /import .* from ["'](?:@hotwired\/stimulus|\.\/application)["']\n/

        if content.match?(import_anchor)
          insert_into_file target_path, import_line, after: import_anchor
        elsif content.match?(/^import /)
          insert_into_file target_path, import_line, before: /^import /
        else
          prepend_to_file target_path, import_line
        end
      end

      def insert_registration(target_path, register_line, content)
        if content.match?(/Application\.start\(\)\n/)
          insert_into_file target_path, register_line, after: /Application\.start\(\)\n/
        else
          append_to_file target_path, register_line
        end
      end

      def upstream_import_pattern
        /^import\s*\{\s*UltimateTurboModalController\s*\}\s*from\s*["']ultimate_turbo_modal["']\s*\n/
      end

      def upstream_register_pattern
        /^application\.register\(\s*["']modal["']\s*,\s*UltimateTurboModalController\s*\)\s*\n?/
      end

      def say_manual_snippet
        say "\n❌ Could not find a Stimulus controllers file.", :red
        say "   Register the controllers manually in your Stimulus setup.", :yellow
      end
    end
  end
end
